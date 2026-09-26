package com.zenith.api;

import com.zenith.committee.CommitteeEvent;
import com.zenith.committee.CommitteeGate;
import com.zenith.committee.CommitteeService;
import com.zenith.config.ZenithProperties;
import com.zenith.data.DataException;
import com.zenith.json.Json;
import com.zenith.llm.LlmException;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CancellationException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api")
public class CommitteeController {

    private static final Logger log = LoggerFactory.getLogger(CommitteeController.class);
    private static final Pattern TICKER = Pattern.compile("^[A-Z][A-Z0-9.\\-]{0,9}$");
    private static final String BAD_TICKER = "Enter a valid ticker symbol, e.g. AAPL";

    private final CommitteeService committee;
    private final CommitteeGate gate;
    private final ZenithProperties props;
    private final com.zenith.llm.SpendGuard spendGuard;

    public CommitteeController(CommitteeService committee, CommitteeGate gate, ZenithProperties props, com.zenith.llm.SpendGuard spendGuard) {
        this.committee = committee;
        this.gate = gate;
        this.props = props;
        this.spendGuard = spendGuard;
    }

    public record CommitteeRequest(String ticker, Boolean rebuttals) {}

    static Optional<String> parseTicker(String raw) {
        String t = raw == null ? "" : raw.trim().toUpperCase();
        return TICKER.matcher(t).matches() ? Optional.of(t) : Optional.empty();
    }

    static int statusFor(Throwable e) {
        if (e instanceof CommitteeGate.BusyException) return 429;
        if (e instanceof CommitteeService.NotConfiguredException) return 503;
        if (e instanceof com.zenith.llm.SpendGuard.BudgetExceededException) return 503;
        if (e instanceof LlmException && e.getCause() instanceof com.zenith.llm.SpendGuard.BudgetExceededException) return 503;
        if (e instanceof DataException de) return de.status();
        if (e instanceof LlmException le && le.getCause() instanceof IllegalStateException ise
                && ise.getMessage() != null && ise.getMessage().contains("not configured")) return 503;
        if (e instanceof LlmException) return 502;
        return 500;
    }

    private static ResponseEntity<String> json(int status, Object body) {
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_JSON).body(Json.MAPPER.writeValueAsString(body));
    }

    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return json(200, Map.of(
                "status", "ok",
                "demoMode", props.demoMode(),
                "budget", Map.of("maxUsd", spendGuard.maxUsd(), "spentUsd", spendGuard.spentUsd()),
                "keys", Map.of(
                        "tokenFactory", props.tokenFactory().configured(),
                        "fmp", !ZenithProperties.isBlank(props.marketData().fmpApiKey()),
                        "finnhub", !ZenithProperties.isBlank(props.marketData().finnhubApiKey()))));
    }

    @GetMapping("/config")
    public ResponseEntity<String> config() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("demoMode", props.demoMode());
        body.put("demoTickers", props.demoTickerList());
        body.put("agents", committee.roster());
        return json(200, body);
    }

    /** Plain request/response version. */
    @PostMapping("/committee")
    public ResponseEntity<String> run(@RequestBody(required = false) CommitteeRequest req) {
        Optional<String> ticker = parseTicker(req == null ? null : req.ticker());
        if (ticker.isEmpty()) return json(400, Map.of("error", BAD_TICKER));
        try {
            return json(200, gate.run(ticker.get(), Boolean.TRUE.equals(req.rebuttals()), e -> {}));
        } catch (RuntimeException e) {
            log.error("Committee failed for {}", ticker.get(), e);
            return json(statusFor(e), Map.of("error", String.valueOf(e.getMessage())));
        }
    }

    /** Server-Sent Events version: analyst cards appear in the UI as each agent finishes. */
    @GetMapping(path = "/committee/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@RequestParam(required = false) String ticker, @RequestParam(defaultValue = "false") boolean rebuttals) {
        SseEmitter emitter = new SseEmitter(600_000L);
        Object lock = new Object();
        // Once the visitor has gone, the next event aborts the run, so no further (paid) stage starts for nobody.
        AtomicBoolean gone = new AtomicBoolean();
        emitter.onError(e -> gone.set(true));
        emitter.onTimeout(() -> gone.set(true));
        // SseEmitter isn't thread-safe and analysts finish on different threads, so sends are serialised.
        Consumer<CommitteeEvent> send = event -> {
            synchronized (lock) {
                if (gone.get()) throw new CancellationException("Client disconnected");
                try {
                    emitter.send(SseEmitter.event().name(event.type()).data(Json.MAPPER.writeValueAsString(event), MediaType.APPLICATION_JSON));
                } catch (IOException | IllegalStateException e) {
                    gone.set(true);
                    throw new CancellationException("Client disconnected: " + e.getMessage());
                }
            }
        };

        Optional<String> parsed = parseTicker(ticker);
        Thread.startVirtualThread(() -> {
            try {
                if (parsed.isEmpty()) {
                    send.accept(new CommitteeEvent.Error(BAD_TICKER, 400));
                    return;
                }
                send.accept(new CommitteeEvent.Done(gate.run(parsed.get(), rebuttals, send)));
            } catch (CancellationException e) {
                log.info("Committee run for {} stopped: the visitor left ({})", ticker, e.getMessage());
            } catch (RuntimeException e) {
                log.error("Committee stream failed for {}", ticker, e);
                try {
                    send.accept(new CommitteeEvent.Error(String.valueOf(e.getMessage()), statusFor(e)));
                } catch (CancellationException ignored) {
                    // nobody left to tell
                }
            } finally {
                emitter.complete();
            }
        });
        return emitter;
    }
}
