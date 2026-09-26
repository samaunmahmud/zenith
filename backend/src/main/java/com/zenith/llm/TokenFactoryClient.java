package com.zenith.llm;

import com.zenith.config.ZenithProperties;
import com.zenith.json.Json;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import tools.jackson.core.JacksonException;

/**
 * Every model call in Zenith goes through here. Responsibilities:
 * <ol>
 *   <li>route each agent to its Nemotron tier (Nano / Super / Ultra)</li>
 *   <li>ask for structured JSON output, using a schema generated from our records</li>
 *   <li>validate the reply; on failure retry ONCE with the problems fed back to the model</li>
 *   <li>record tokens, latency and estimated cost for every call, including rejected attempts</li>
 * </ol>
 */
@Service
public class TokenFactoryClient {

    private static final Logger log = LoggerFactory.getLogger(TokenFactoryClient.class);
    private static final int MAX_ATTEMPTS = 2;

    private final ChatTransport transport;
    private final ZenithProperties props;
    private final Validator validator;
    private final SpendGuard spendGuard;

    // Models whose endpoint rejected json_schema: we fall back to plain json_object for them.
    private final Set<String> noSchemaSupport = ConcurrentHashMap.newKeySet();

    public TokenFactoryClient(ChatTransport transport, ZenithProperties props, Validator validator, SpendGuard spendGuard) {
        this.transport = transport;
        this.props = props;
        this.validator = validator;
        this.spendGuard = spendGuard;
    }

    public boolean configured() {
        return props.tokenFactory().configured();
    }

    public SpendGuard spendGuard() {
        return spendGuard;
    }

    public ZenithProperties.Price priceFor(ModelTier tier) {
        return props.tokenFactory().pricing().get(tier);
    }

    public String modelFor(ModelTier tier) {
        return props.tokenFactory().models().get(tier);
    }

    /** A structured call: the reply must parse into {@code type}, pass Bean Validation, then pass {@code check}. */
    public record StructuredCall<T>(
            String agent,
            ModelTier tier,
            String system,
            String user,
            Class<T> type,
            double temperature,
            CostTracker tracker,
            Function<T, List<String>> check) {}

    public record ChatResult(String text, int costIndex) {}

    /** One raw chat completion, with cost tracking. */
    public ChatResult chat(
            String agent,
            ModelTier tier,
            List<ChatTransport.Message> messages,
            double temperature,
            int maxTokens,
            Class<?> schemaType,
            CostTracker tracker,
            int attempt) {
        String model = modelFor(tier);
        var price = props.tokenFactory().pricing().get(tier);
        boolean useSchema = schemaType != null && !noSchemaSupport.contains(model);

        Map<String, Object> responseFormat = null;
        if (schemaType != null) {
            responseFormat = useSchema
                    ? Map.of("type", "json_schema", "json_schema", Map.of("name", schemaType.getSimpleName(), "schema", JsonSchemas.forType(schemaType)))
                    : Map.of("type", "json_object");
        }

        spendGuard.checkAvailable(); // hard spending cap: refuse before any tokens are spent

        long started = System.currentTimeMillis();
        ChatTransport.Response res;
        try {
            res = transport.send(new ChatTransport.Request(model, messages, temperature, maxTokens, responseFormat));
        } catch (ChatTransport.HttpError e) {
            if (useSchema && e.status() == 400 && e.getMessage().matches("(?is).*(response_format|json_schema|schema).*")) {
                log.warn("{} rejected json_schema, falling back to json_object", model);
                noSchemaSupport.add(model);
                return chat(agent, tier, messages, temperature, maxTokens, schemaType, tracker, attempt);
            }
            throw new LlmException(agent + " call failed: " + e.getMessage(), agent, e);
        } catch (ChatTransport.MaybeBilledException e) {
            // No usage came back, but the call may have been billed: charge the worst case against the cap
            // (the whole prompt plus max_tokens of output). Over-counting is the safe error for a hard cap.
            int promptEstimate = messages.stream().mapToInt(m -> m.content().length()).sum() / 3;
            double worst = CostTracker.estimateCostUsd(promptEstimate, maxTokens, price.input(), price.output());
            spendGuard.record(worst);
            if (tracker != null) {
                tracker.record(new CallCost(agent, model, tier, promptEstimate, maxTokens,
                        System.currentTimeMillis() - started, worst, attempt, false));
            }
            log.warn("{} got no reply; charged a worst-case ${} against the cap", agent, String.format(java.util.Locale.ROOT, "%.4f", worst));
            throw new LlmException(agent + " call failed: " + e.getMessage(), agent, e);
        } catch (RuntimeException e) {
            throw new LlmException(agent + " call failed: " + e.getMessage(), agent, e);
        }

        long latency = System.currentTimeMillis() - started;
        double cost = CostTracker.estimateCostUsd(res.promptTokens(), res.completionTokens(), price.input(), price.output());
        spendGuard.record(cost);
        CallCost call = new CallCost(agent, model, tier, res.promptTokens(), res.completionTokens(), latency, cost, attempt, true);
        int index = tracker == null ? -1 : tracker.record(call);
        return new ChatResult(res.content(), index);
    }

    public <T> T callStructured(StructuredCall<T> call) {
        List<ChatTransport.Message> messages = new ArrayList<>(List.of(
                new ChatTransport.Message("system", call.system()),
                new ChatTransport.Message("user", call.user())));

        List<String> issues = List.of();
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            ChatResult result = chat(call.agent(), call.tier(), messages, call.temperature(), 8192, call.type(), call.tracker(), attempt);

            ParseOutcome<T> outcome = parseAndValidate(result.text(), call);
            if (outcome.issues().isEmpty()) return outcome.value();

            issues = outcome.issues();
            log.info("{} attempt {} rejected: {}", call.agent(), attempt, issues);
            // Mark exactly this call as rejected (not "the last one": analysts run in parallel).
            if (call.tracker() != null && result.costIndex() >= 0) call.tracker().markRejected(result.costIndex());

            messages.add(new ChatTransport.Message("assistant", result.text()));
            messages.add(new ChatTransport.Message("user",
                    "Your previous reply was rejected by the validator:\n- " + String.join("\n- ", issues)
                            + "\nReturn a corrected JSON object only. No prose, no markdown fences."));
        }
        throw new LlmException(call.agent() + " returned invalid output twice", call.agent(), issues);
    }

    private record ParseOutcome<T>(T value, List<String> issues) {}

    private <T> ParseOutcome<T> parseAndValidate(String text, StructuredCall<T> call) {
        T value;
        try {
            value = Json.MAPPER.readValue(JsonExtractor.extract(text), call.type());
        } catch (IllegalArgumentException | JacksonException e) {
            return new ParseOutcome<>(null, List.of("Reply was not valid JSON for this schema: " + firstLine(e.getMessage())));
        }
        Set<ConstraintViolation<T>> violations = validator.validate(value);
        if (!violations.isEmpty()) {
            List<String> issues = violations.stream()
                    .map(v -> (v.getPropertyPath().toString().isEmpty() ? "(root)" : v.getPropertyPath()) + ": " + v.getMessage())
                    .sorted()
                    .toList();
            return new ParseOutcome<>(null, issues);
        }
        List<String> extra = call.check() == null ? List.of() : call.check().apply(value);
        return new ParseOutcome<>(extra.isEmpty() ? value : null, extra);
    }

    private static String firstLine(String s) {
        if (s == null) return "unknown error";
        int nl = s.indexOf('\n');
        return nl == -1 ? s : s.substring(0, nl);
    }
}
