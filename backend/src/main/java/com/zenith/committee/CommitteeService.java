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
import java.util.concurrent.CancellationException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.function.BiConsumer;
import java.util.function.Consumer;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.zenith.track.DecisionLedger;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Runs one committee meeting:
 * data → indicators → news digest (Nano) alongside the technicals analyst → fundamentals and risk → optional rebuttal
 * round → chair (Ultra) → memo.
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
    private final DecisionLedger ledger; // null in tests that don't need a track record

    public CommitteeService(MarketDataService marketData, NewsAgent newsAgent, AnalystAgent analystAgent,
            RebuttalAgent rebuttalAgent, ChairAgent chairAgent, TokenFactoryClient llm, DiskCache cache) {
        this(marketData, newsAgent, analystAgent, rebuttalAgent, chairAgent, llm, cache, null);
    }

    @Autowired
    public CommitteeService(MarketDataService marketData, NewsAgent newsAgent, AnalystAgent analystAgent,
            RebuttalAgent rebuttalAgent, ChairAgent chairAgent, TokenFactoryClient llm, DiskCache cache, DecisionLedger ledger) {
        this.marketData = marketData;
        this.newsAgent = newsAgent;
        this.analystAgent = analystAgent;
        this.rebuttalAgent = rebuttalAgent;
        this.chairAgent = chairAgent;
        this.llm = llm;
        this.cache = cache;
        this.ledger = ledger;
    }

    public List<AgentModel> roster() {
        return Roster.all().stream().map(a -> new AgentModel(a.id(), a.label(), a.tier(), llm.modelFor(a.tier()), a.why(),
                llm.reasons(a.id()))).toList();
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

        // 3. News desk (Nano) and the analyst round. Each analyst starts as soon as its inputs exist: technicals works
        // from prices alone, so it starts alongside the news desk; fundamentals and risk read the news digest, so they
        // start when it's ready. The slowest Nano call is no longer queued behind another one.
        List<AnalystReport> reports = Collections.synchronizedList(new ArrayList<>());
        List<CommitteeResult.AnalystError> errors = Collections.synchronizedList(new ArrayList<>());
        List<RuntimeException> failures = Collections.synchronizedList(new ArrayList<>());
        BiConsumer<AnalystName, NewsDigest> analyse = (analyst, news) -> {
            try {
                AnalystReport report = analystAgent.run(analyst, snapshot, news, tracker);
                reports.add(report);
                emit.accept(new CommitteeEvent.Report(report));
            } catch (CancellationException e) {
                throw e; // the visitor left; not this analyst's failure
            } catch (RuntimeException e) {
                errors.add(new CommitteeResult.AnalystError(analyst, message(e)));
                failures.add(e);
                emit.accept(new CommitteeEvent.AnalystFailed(analyst, message(e)));
            }
        };

        NewsDigest digest = null;
        try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<?>> analysts = new ArrayList<>();
            try {
                emit.accept(new CommitteeEvent.Stage("news", "News desk is summarising headlines; the technicals analyst reads the charts"));
                analysts.add(pool.submit(() -> analyse.accept(AnalystName.TECHNICALS, null)));
                try {
                    digest = newsAgent.summarise(ticker, md.news(), tracker);
                } catch (CancellationException e) {
                    throw e;
                } catch (RuntimeException e) {
                    log.warn("News digest failed: {}", message(e)); // optional: the analysts are told there's no news
                }
                emit.accept(new CommitteeEvent.News(digest));

                emit.accept(new CommitteeEvent.Stage("analysts", "Analysts are preparing their reports"));
                final NewsDigest news = digest;
                for (AnalystName a : Roster.ORDER) {
                    if (a != AnalystName.TECHNICALS) analysts.add(pool.submit(() -> analyse.accept(a, news)));
                }
            } catch (CancellationException e) {
                pool.shutdownNow(); // the visitor left: stop the calls already under way rather than wait for them
                throw e;
            }
            awaitAll(analysts);
        }
        List<AnalystReport> sortedReports = sortByAnalyst(reports, AnalystReport::analyst);
        if (sortedReports.isEmpty()) {
            // Keep the first failure as the cause, so a spent budget still maps to "budget" (503), not a model error.
            String first = errors.isEmpty() ? "unknown" : errors.get(0).message();
            throw failures.isEmpty()
                    ? new LlmException("All analysts failed. First error: " + first, "committee", List.of())
                    : new LlmException("All analysts failed. First error: " + first, "committee", failures.get(0));
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
                } catch (CancellationException e) {
                    throw e;
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
        // Every fresh decision goes on the record, to be scored against the market later. Replays never get here.
        if (decision != null && ledger != null) ledger.record(result);
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
            awaitAll(items.stream().<Future<?>>map(item -> pool.submit(() -> task.accept(item))).toList());
        }
    }

    /** Waits for every task; if any stopped because the visitor left, rethrows that once all are done. */
    private static void awaitAll(List<Future<?>> futures) {
        CancellationException cancelled = null;
        for (Future<?> f : futures) {
            try {
                f.get();
            } catch (ExecutionException e) {
                if (e.getCause() instanceof CancellationException c) cancelled = c;
                else log.error("Parallel task failed unexpectedly", e.getCause());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new CancellationException("Interrupted");
            }
        }
        if (cancelled != null) throw cancelled; // the visitor left mid-stage: don't start the next one
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
