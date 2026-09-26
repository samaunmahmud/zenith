package com.zenith.committee;

import com.zenith.agents.AgentInputs;
import com.zenith.agents.AnalystAgent;
import com.zenith.agents.ChairAgent;
import com.zenith.agents.NewsAgent;
import com.zenith.agents.NumberCheck;
import com.zenith.agents.RebuttalAgent;
import com.zenith.agents.Roster;
import com.zenith.data.DiskCache;
import com.zenith.data.MarketData;
import com.zenith.data.MarketDataService;
import com.zenith.indicators.Snapshot;
import com.zenith.indicators.SnapshotBuilder;
import com.zenith.json.Json;
import com.zenith.llm.CostTracker;
import com.zenith.llm.LlmException;
import com.zenith.llm.ModelTier;
import com.zenith.llm.TokenFactoryClient;
import com.zenith.memo.MemoBuilder;
import com.zenith.schema.AnalystName;
import com.zenith.schema.AnalystReport;
import com.zenith.schema.ChairDecision;
import com.zenith.schema.NewsDigest;
import com.zenith.schema.Rebuttal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.function.Consumer;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Runs one committee meeting:
 * data → indicators → news digest (Nano) → 3 analysts in parallel → optional rebuttal round → chair (Ultra) → memo.
 *
 * <p>Analyst failures are isolated: the chair still decides on the reports that did arrive, and is told
 * which are missing. Progress is emitted as events so the UI can stream it.
 */
@Service
public class CommitteeService implements CommitteeRunner {

    private static final Logger log = LoggerFactory.getLogger(CommitteeService.class);

    private final MarketDataService marketData;
    private final NewsAgent newsAgent;
    private final AnalystAgent analystAgent;
    private final RebuttalAgent rebuttalAgent;
    private final ChairAgent chairAgent;
    private final TokenFactoryClient llm;
    private final DiskCache cache;

    public CommitteeService(MarketDataService marketData, NewsAgent newsAgent, AnalystAgent analystAgent,
            RebuttalAgent rebuttalAgent, ChairAgent chairAgent, TokenFactoryClient llm, DiskCache cache) {
        this.marketData = marketData;
        this.newsAgent = newsAgent;
        this.analystAgent = analystAgent;
        this.rebuttalAgent = rebuttalAgent;
        this.chairAgent = chairAgent;
        this.llm = llm;
        this.cache = cache;
    }

    public List<AgentModel> roster() {
        return Roster.all().stream().map(a -> new AgentModel(a.id(), a.label(), a.tier(), llm.modelFor(a.tier()), a.why())).toList();
    }

    @Override
    public CommitteeResult run(String ticker, boolean withRebuttals, Consumer<CommitteeEvent> emit) {
        CostTracker tracker = new CostTracker();
        List<AgentModel> agents = roster();

        // 1–2. Data and indicators (deterministic, no LLM)
        emit.accept(new CommitteeEvent.Stage("data", "Fetching market data for " + ticker));
        MarketData md = marketData.get(ticker);
        Snapshot snapshot = SnapshotBuilder.build(md);
        emit.accept(new CommitteeEvent.SnapshotReady(snapshot, md.sources(), md.news(), agents));

        // Fail fast with one clear message instead of letting every agent fail separately.
        // The market data above has already been sent, so the UI still shows it.
        if (!llm.configured()) {
            throw new NotConfiguredException("AI analysis unavailable: Token Factory is not configured (set TOKEN_FACTORY_API_KEY in .env)");
        }
        llm.spendGuard().checkAvailable();

        // News digest (Nano). Optional: a failure just means the analysts see "no news".
        emit.accept(new CommitteeEvent.Stage("news", "News desk is summarising headlines"));
        NewsDigest digest = null;
        try {
            digest = newsAgent.summarise(ticker, md.news(), tracker);
        } catch (RuntimeException e) {
            log.warn("News digest failed: {}", message(e));
        }
        emit.accept(new CommitteeEvent.News(digest));

        // 3. Analyst round, in parallel
        emit.accept(new CommitteeEvent.Stage("analysts", "Analysts are preparing their reports"));
        List<AnalystReport> reports = Collections.synchronizedList(new ArrayList<>());
        List<CommitteeResult.AnalystError> errors = Collections.synchronizedList(new ArrayList<>());
        final NewsDigest news = digest;
        runInParallel(Roster.ORDER, analyst -> {
            try {
                AnalystReport report = analystAgent.run(analyst, snapshot, news, tracker);
                reports.add(report);
                emit.accept(new CommitteeEvent.Report(report));
            } catch (RuntimeException e) {
                errors.add(new CommitteeResult.AnalystError(analyst, message(e)));
                emit.accept(new CommitteeEvent.AnalystFailed(analyst, message(e)));
            }
        });
        List<AnalystReport> sortedReports = sortByAnalyst(reports, AnalystReport::analyst);
        if (sortedReports.isEmpty()) {
            throw new LlmException("All analysts failed. First error: " + (errors.isEmpty() ? "unknown" : errors.get(0).message()),
                    "committee", List.of());
        }

        // 4. Optional rebuttal round: exactly one round, in parallel, needs at least two reports
        List<Rebuttal> rebuttals = Collections.synchronizedList(new ArrayList<>());
        if (withRebuttals && sortedReports.size() >= 2) {
            emit.accept(new CommitteeEvent.Stage("rebuttals", "Analysts are responding to each other"));
            runInParallel(sortedReports.stream().map(AnalystReport::analyst).toList(), analyst -> {
                try {
                    Rebuttal r = rebuttalAgent.run(analyst, ticker, sortedReports, tracker);
                    rebuttals.add(r);
                    emit.accept(new CommitteeEvent.RebuttalReady(r));
                } catch (RuntimeException e) {
                    log.warn("{} rebuttal failed: {}", analyst.id(), message(e));
                }
            });
        }
        List<Rebuttal> sortedRebuttals = sortByAnalyst(rebuttals, Rebuttal::analyst);

        // 5. Chair (Ultra)
        emit.accept(new CommitteeEvent.Stage("chair", "The chair is weighing the arguments"));
        ChairDecision decision = null;
        String chairError = null;
        try {
            decision = chairAgent.run(snapshot, sortedReports, sortedRebuttals, tracker);
            emit.accept(new CommitteeEvent.Decision(decision));
        } catch (RuntimeException e) {
            chairError = message(e);
        }

        // 6. Memo (code-assembled)
        emit.accept(new CommitteeEvent.Stage("memo", "Writing the memo"));
        CommitteeResult partial = new CommitteeResult(
                ticker,
                Instant.now().toString(),
                snapshot,
                md.sources(),
                md.news(),
                digest,
                sortedReports,
                sortByAnalyst(errors, CommitteeResult.AnalystError::analyst),
                sortedRebuttals,
                decision,
                chairError,
                null,
                tracker.summary(llm.priceFor(ModelTier.ULTRA)),
                integrityFlags(snapshot, digest, sortedReports, sortedRebuttals, decision),
                agents,
                false,
                null);
        CommitteeResult result = partial.withMemo(MemoBuilder.build(partial));

        // Keep the last complete run per ticker: the demo safety net if Token Factory is unreachable on stage.
        if (decision != null) cache.write(ticker, "last-committee", result);
        return result;
    }

    /** A required service (Token Factory, market data) has no API key. Maps to HTTP 503. */
    public static class NotConfiguredException extends RuntimeException {
        public NotConfiguredException(String message) {
            super(message);
        }
    }

    @Override
    public Optional<CommitteeResult> lastSavedRun(String ticker) {
        return cache.<CommitteeResult>read(ticker, "last-committee", Json.MAPPER.constructType(CommitteeResult.class))
                .map(e -> e.data().asReplay(CommitteeGate.FALLBACK));
    }

    private static <T> void runInParallel(List<T> items, Consumer<T> task) {
        try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<?>> futures = items.stream().<Future<?>>map(item -> pool.submit(() -> task.accept(item))).toList();
            for (Future<?> f : futures) {
                try {
                    f.get();
                } catch (Exception e) {
                    log.error("Parallel task failed unexpectedly", e);
                }
            }
        }
    }

    private static <T> List<T> sortByAnalyst(List<T> items, java.util.function.Function<T, AnalystName> key) {
        synchronized (items) {
            return items.stream().sorted(Comparator.comparingInt(x -> Roster.ORDER.indexOf(key.apply(x)))).toList();
        }
    }

    static String message(Throwable e) {
        return e instanceof LlmException le ? le.detail() : e.getMessage();
    }

    /**
     * Soft integrity check on free text (headlines, key points, rationale...). Evidence values are already
     * hard-checked with a retry; here we only report figures we couldn't trace.
     */
    private static List<CommitteeResult.IntegrityFlag> integrityFlags(Snapshot snapshot, NewsDigest news,
            List<AnalystReport> reports, List<Rebuttal> rebuttals, ChairDecision decision) {
        List<CommitteeResult.IntegrityFlag> flags = new ArrayList<>();

        for (AnalystReport r : reports) {
            List<String> texts = Stream.of(
                    Stream.of(r.headline()), r.keyPoints().stream(), r.evidence().stream().map(e -> e.interpretation()), r.concerns().stream())
                    .flatMap(s -> s).toList();
            check(flags, r.analyst().id(), List.of(AgentInputs.analystInput(r.analyst(), snapshot, news)), texts);
        }
        // Rebuttals may quote any analyst's input or report. Not the rebuttals themselves: a rebuttal checked
        // against a list that contains its own text could never be flagged.
        List<String> forRebuttals = new ArrayList<>();
        Roster.ORDER.forEach(a -> forRebuttals.add(AgentInputs.analystInput(a, snapshot, news)));
        forRebuttals.add(AgentInputs.chairInput(snapshot, reports, List.of()));
        for (Rebuttal r : rebuttals) check(flags, r.analyst().id() + "-rebuttal", forRebuttals, List.of(r.response()));
        // The chair saw everything, rebuttals included.
        List<String> everything = new ArrayList<>(forRebuttals);
        everything.add(AgentInputs.chairInput(snapshot, reports, rebuttals));
        if (decision != null) {
            List<String> texts = new ArrayList<>(List.of(decision.summary()));
            texts.addAll(decision.rationale());
            texts.addAll(decision.keyRisks());
            if (decision.dissent() != null) texts.add(decision.dissent().argument());
            check(flags, "chair", everything, texts);
        }
        return flags;
    }

    private static void check(List<CommitteeResult.IntegrityFlag> flags, String agent, List<String> inputs, List<String> texts) {
        List<Double> allowed = NumberCheck.allowedNumbers(inputs);
        LinkedHashSet<String> figures = new LinkedHashSet<>();
        texts.forEach(t -> figures.addAll(NumberCheck.unsupportedNumbers(t, allowed)));
        if (!figures.isEmpty()) flags.add(new CommitteeResult.IntegrityFlag(agent, List.copyOf(figures)));
    }
}
