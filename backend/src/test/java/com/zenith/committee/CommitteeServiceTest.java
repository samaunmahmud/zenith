package com.zenith.committee;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

import com.zenith.agents.AnalystAgent;
import com.zenith.agents.ChairAgent;
import com.zenith.agents.NewsAgent;
import com.zenith.agents.RebuttalAgent;
import com.zenith.config.ZenithProperties;
import com.zenith.data.CompanyProfile;
import com.zenith.data.DiskCache;
import com.zenith.data.MarketData;
import com.zenith.data.MarketDataService;
import com.zenith.data.NewsItem;
import com.zenith.data.PriceBar;
import com.zenith.data.SourceInfo;
import com.zenith.json.Json;
import com.zenith.llm.CallCost;
import com.zenith.llm.ChatTransport;
import com.zenith.llm.ModelTier;
import com.zenith.llm.TokenFactoryClient;
import com.zenith.schema.AnalystName;
import com.zenith.schema.Recommendation;
import com.zenith.support.TestProps;
import jakarta.validation.Validation;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.io.TempDir;

/**
 * End-to-end test of the committee with a fake Token Factory and synthetic market data. Exercises:
 * snapshot → news → parallel analysts → retry on an invented number → rebuttals → chair → memo → costs.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class CommitteeServiceTest {

    private final List<String[]> calls = Collections.synchronizedList(new ArrayList<>()); // [model, system]
    private final AtomicInteger technicalsAttempts = new AtomicInteger();
    private final List<String> events = Collections.synchronizedList(new ArrayList<>());
    private CommitteeResult result;
    private CommitteeService service;

    private static List<PriceBar> bars(int n, double start, double drift) {
        List<PriceBar> out = new ArrayList<>();
        double close = start;
        for (int i = 0; i < n; i++) {
            close *= 1 + drift + Math.sin(i / 3.0) * 0.01;
            out.add(new PriceBar(LocalDate.of(2025, 1, 1).plusDays(i).toString(), close, close * 1.01, close * 0.99, close, 1_000_000));
        }
        return out;
    }

    private static final MarketData MARKET = new MarketData(
            "TEST",
            new CompanyProfile("TEST", "Test Corp", "Technology", "Software", null, "USD", "NASDAQ", null, 2.5e12),
            bars(300, 100, 0.001),
            bars(300, 400, 0.0005),
            Map.of("priceToEarningsRatioTTM", 31.42, "grossProfitMarginTTM", 0.462),
            Map.of(),
            Map.of("revenueGrowth", 0.08),
            List.of(new NewsItem("Test Corp launches product", "Wire", "2026-09-20T00:00:00Z", "", "")),
            List.of(new SourceInfo("fake", "2026-09-26T00:00:00Z", false)));

    private static final Pattern ANALYST_ID = Pattern.compile("Your analyst id is \"(\\w+)\"");
    private static final Pattern REBUTTAL_ID = Pattern.compile("You are the (\\w+) analyst");
    private static final Pattern LAST_CLOSE = Pattern.compile("Last close: (\\S+)");

    /** Fake Nemotron: answers based on which agent's system prompt it receives. */
    private ChatTransport.Response fakeNemotron(ChatTransport.Request req) {
        String system = req.messages().get(0).content();
        String user = req.messages().get(1).content();
        calls.add(new String[] {req.model(), system});
        Matcher close = LAST_CLOSE.matcher(user);
        String lastClose = close.find() ? close.group(1) : "$1.00";
        Object body;

        if (system.startsWith("You are a news desk")) {
            body = Map.of("sentiment", "positive", "themes", List.of("Product launch"), "notableEvents", List.of("New product"));
        } else if (system.contains("Chair of an investment committee")) {
            body = Map.of(
                    "recommendation", "HOLD",
                    "confidence", 0.6,
                    "summary", "Balanced case.",
                    "rationale", List.of("[Fundamentals] margins are strong", "[Technicals] trend is up", "[Risk] volatility is manageable"),
                    "dissent", Map.of("analyst", "fundamentals", "argument", "Valuation at a P/E of 31.42 is rich."),
                    "keyRisks", List.of("Valuation", "Momentum fading"),
                    "timeHorizon", "3-6 months");
        } else if (system.contains("rebuttal")) {
            Matcher m = REBUTTAL_ID.matcher(system);
            m.find();
            String me = m.group(1);
            body = Map.of("analyst", me, "respondingTo", me.equals("risk") ? "technicals" : "risk", "response",
                    // The risk analyst's rebuttal invents a figure: the integrity check must flag it.
                    me.equals("risk") ? "Margins could compress by 93.17%." : "I disagree.", "stanceChanged", false);
        } else {
            Matcher m = ANALYST_ID.matcher(system);
            m.find();
            String analyst = m.group(1);
            String value = lastClose;
            // Technicals invents a number on its first attempt; the validator must catch it and retry.
            if (analyst.equals("technicals") && technicalsAttempts.getAndIncrement() == 0) value = "$999.99";
            body = Map.of(
                    "analyst", analyst,
                    "stance", "bullish",
                    "confidence", 0.7,
                    "headline", analyst + " thesis",
                    "keyPoints", List.of("Point one", "Point two"),
                    "evidence", List.of(Map.of("metric", "Last close", "value", value, "interpretation", "Price level")),
                    "concerns", List.of());
        }
        return new ChatTransport.Response(Json.MAPPER.writeValueAsString(body), 1000, 200);
    }

    private CommitteeService serviceWith(ZenithProperties props) {
        var llm = new TokenFactoryClient(this::fakeNemotron, props, Validation.buildDefaultValidatorFactory().getValidator(),
                new com.zenith.llm.SpendGuard(props));
        var market = new MarketDataService(null, null, null, props) {
            @Override
            public MarketData get(String ticker) {
                return MARKET;
            }
        };
        return new CommitteeService(market, new NewsAgent(llm), new AnalystAgent(llm), new RebuttalAgent(llm),
                new ChairAgent(llm), llm, new DiskCache(props));
    }

    @BeforeAll
    void runCommittee(@TempDir Path cacheDir) {
        service = serviceWith(TestProps.create(cacheDir, false, 12));
        result = service.run("TEST", true, e -> events.add(e.type()));
    }

    @Test
    void stopsBeforeTheChairWhenTheVisitorLeavesDuringTheAnalystRound(@TempDir Path dir) {
        CommitteeService svc = serviceWith(TestProps.create(dir, false, 12));
        int before = calls.size();
        // The stream's emit throws once the visitor has gone; here they leave as the first report arrives.
        assertThatThrownBy(() -> svc.run("TEST", true, e -> {
            if (e.type().equals("report")) throw new java.util.concurrent.CancellationException("Client disconnected");
        })).isInstanceOf(java.util.concurrent.CancellationException.class);
        List<String[]> made = List.copyOf(calls.subList(before, calls.size()));
        assertThat(made).noneMatch(c -> c[0].equals("fake-ultra")); // no chair call: the most expensive one
        assertThat(made).noneMatch(c -> c[1].contains("rebuttal"));
    }

    @Test
    void aBudgetThatRunsOutMidRunSurfacesAsABudgetError(@TempDir Path dir) {
        // $0.0001 passes the up-front check; the news call (~$0.000108 on Nano) then uses it up, so every analyst
        // is refused. The error must say "budget" (503, quota refunded), not look like a model failure (502).
        CommitteeService broke = serviceWith(TestProps.create(dir, false, 12, 0.0001));
        assertThatThrownBy(() -> broke.run("TEST", false, e -> {}))
                .hasMessageContaining("All analysts failed")
                .hasCauseInstanceOf(com.zenith.llm.SpendGuard.BudgetExceededException.class)
                .satisfies(e -> assertThat(CommitteeGate.costNothing(e)).isTrue());
    }

    @Test
    void producesThreeValidatedReportsRebuttalsAndADecision() {
        assertThat(result.reports()).extracting(r -> r.analyst())
                .containsExactly(AnalystName.FUNDAMENTALS, AnalystName.TECHNICALS, AnalystName.RISK);
        assertThat(result.analystErrors()).isEmpty();
        assertThat(result.rebuttals()).hasSize(3);
        assertThat(result.decision().recommendation()).isEqualTo(Recommendation.HOLD);
        assertThat(result.decision().dissent().analyst()).isEqualTo(AnalystName.FUNDAMENTALS);
    }

    private String modelFor(String needle) {
        synchronized (calls) {
            return calls.stream().filter(c -> c[1].contains(needle)).map(c -> c[0]).findFirst().orElse(null);
        }
    }

    @Test
    void routesEachAgentToTheRightNemotronTier() {
        assertThat(modelFor("news desk")).isEqualTo("fake-nano");
        assertThat(modelFor("analyst id is \"technicals\"")).isEqualTo("fake-nano");
        assertThat(modelFor("analyst id is \"fundamentals\"")).isEqualTo("fake-super");
        assertThat(modelFor("analyst id is \"risk\"")).isEqualTo("fake-super");
        assertThat(modelFor("Chair of an investment committee")).isEqualTo("fake-ultra");
    }

    @Test
    void retriesAnAnalystThatInventedANumberAndCostsBothAttempts() {
        List<CallCost> tech = result.costs().calls().stream().filter(c -> c.agent().equals("technicals")).toList();
        assertThat(tech).extracting(CallCost::attempt, CallCost::ok)
                .containsExactly(org.assertj.core.groups.Tuple.tuple(1, false), org.assertj.core.groups.Tuple.tuple(2, true));
        assertThat(result.reports().get(1).evidence().get(0).value()).isNotEqualTo("$999.99");
    }

    @Test
    void totalsTheCommitteeCostByModelTier() {
        // 1 news + 4 analyst calls (one retry) + 3 rebuttals + 1 chair = 9 calls
        assertThat(result.costs().calls()).hasSize(9);
        assertThat(result.costs().byTier().get(ModelTier.ULTRA).calls()).isEqualTo(1);
        // Ultra: 1000 in × $1/M + 200 out × $3/M = $0.0016
        assertThat(result.costs().byTier().get(ModelTier.ULTRA).usd()).isCloseTo(0.0016, within(1e-9));
    }

    @Test
    void buildsAMemoWithTheDecisionDissentCostTableAndDisclaimer() {
        assertThat(result.memoMarkdown())
                .contains("## Decision: HOLD")
                .contains("Fundamentals analyst:** Valuation at a P/E of 31.42 is rich.")
                .contains("## Committee cost")
                .contains("not financial advice");
    }

    @Test
    void flagsOnlyTheRebuttalThatInventedAFigure() {
        // Analysts and the chair quote only their input; one rebuttal invents 93.17%.
        assertThat(result.integrity()).containsExactly(new CommitteeResult.IntegrityFlag("risk-rebuttal", List.of("93.17")));
    }

    @Test
    void streamsProgressEventsInOrder() {
        assertThat(events.get(0)).isEqualTo("stage");
        assertThat(events).contains("snapshot");
        assertThat(events.stream().filter("report"::equals).count()).isEqualTo(3);
        assertThat(events.indexOf("decision")).isGreaterThan(events.lastIndexOf("report"));
    }

    @Test
    void savesTheRunAndServesItBackAsAReplay() {
        var replay = service.lastSavedRun("TEST").orElseThrow();
        assertThat(replay.replayed()).isTrue();
        assertThat(replay.decision()).isEqualTo(result.decision());
        assertThat(replay.memoMarkdown()).isEqualTo(result.memoMarkdown());
    }

    @Test
    void serialisesEventsWithATypeField() {
        String json = Json.MAPPER.writeValueAsString(new CommitteeEvent.Stage("data", "hi"));
        assertThat(json).isEqualTo("{\"type\":\"stage\",\"stage\":\"data\",\"message\":\"hi\"}");
    }
}
