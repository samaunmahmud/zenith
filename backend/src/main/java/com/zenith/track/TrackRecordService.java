package com.zenith.track;

import com.zenith.data.MarketDataService;
import com.zenith.data.PriceBar;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Scores every recorded call against what the market did next, over 7, 30 and 90 calendar days.
 *
 * <p>A call is judged on the stock's return <i>relative to the S&amp;P 500 (SPY)</i> over the same window,
 * so a rising market doesn't make every BUY look clever:
 * <ul>
 *   <li>BUY is right if the stock beat SPY;</li>
 *   <li>SELL is right if the stock trailed SPY;</li>
 *   <li>HOLD is right if the stock stayed within {@value #HOLD_BAND_PCT} percentage points of SPY, either way.</li>
 * </ul>
 * The window starts at the close of the trading day the committee's data was from ({@code asOf}) and ends at
 * the first close on or after {@code asOf + days}. Until that close exists, the call is pending, never guessed.
 */
@Service
public class TrackRecordService {

    private static final Logger log = LoggerFactory.getLogger(TrackRecordService.class);

    public static final List<Integer> HORIZONS = List.of(7, 30, 90);
    static final int HOLD_BAND_PCT = 5;
    private static final double HOLD_BAND = HOLD_BAND_PCT / 100.0;
    private static final Duration REPORT_TTL = Duration.ofMinutes(10);

    /** How one call did over one window. Returns are fractions (0.05 = +5%). */
    public record Outcome(int days, String status, String dueDate, String exitDate, Double stockReturn, Double spyReturn,
            Double excess, Boolean correct) {
        static Outcome pending(int days, String due) {
            return new Outcome(days, "pending", due, null, null, null, null, null);
        }
    }

    public record ScoredCall(TrackedCall call, List<Outcome> outcomes) {}

    /**
     * Per-window totals. {@code winRate} is null until at least one call has been scored. {@code avgEdge} is what
     * following the BUY and SELL calls earned against SPY on average (a SELL earns by avoiding underperformance);
     * HOLDs take no side, so they're left out of it.
     */
    public record HorizonSummary(int days, int scored, int correct, int pending, Double winRate, Double avgEdge) {}

    public record Report(String generatedAt, String benchmark, int holdBandPct, List<HorizonSummary> summary,
            List<ScoredCall> calls, List<String> unavailable) {}

    /** Where prices come from; an interface so tests can supply fixed series. */
    public interface Prices {
        List<PriceBar> daily(String ticker);
    }

    private final DecisionLedger ledger;
    private final Prices prices;
    private final Clock clock;
    private Report cached;
    private Instant cachedAt;

    @Autowired
    public TrackRecordService(DecisionLedger ledger, MarketDataService marketData) {
        this(ledger, t -> marketData.prices(t).data(), Clock.systemUTC());
    }

    TrackRecordService(DecisionLedger ledger, Prices prices, Clock clock) {
        this.ledger = ledger;
        this.prices = prices;
        this.clock = clock;
    }

    public synchronized Report report() {
        Instant now = clock.instant();
        List<TrackedCall> calls = ledger.calls();
        // Prices change slowly, so the report is reused for a few minutes, but never once a new call has been recorded.
        if (cached != null && cached.calls().size() == calls.size() && Duration.between(cachedAt, now).compareTo(REPORT_TTL) < 0) {
            return cached;
        }

        Map<String, List<PriceBar>> series = new HashMap<>();
        List<String> unavailable = new ArrayList<>();
        List<PriceBar> spy = fetch(MarketDataService.BENCHMARK, series, unavailable);

        List<ScoredCall> scored = new ArrayList<>();
        for (TrackedCall c : calls) {
            List<PriceBar> bars = fetch(c.ticker(), series, unavailable);
            scored.add(new ScoredCall(c, HORIZONS.stream().map(d -> score(c, bars, spy, d)).toList()));
        }
        scored.sort(Comparator.comparing((ScoredCall s) -> s.call().decidedAt()).reversed());

        cached = new Report(now.toString(), MarketDataService.BENCHMARK, HOLD_BAND_PCT, summarise(scored), scored, unavailable);
        cachedAt = now;
        return cached;
    }

    private List<PriceBar> fetch(String ticker, Map<String, List<PriceBar>> series, List<String> unavailable) {
        return series.computeIfAbsent(ticker, t -> {
            try {
                return prices.daily(t);
            } catch (RuntimeException e) {
                log.warn("Track record: no prices for {}: {}", t, e.getMessage());
                unavailable.add(t);
                return List.of();
            }
        });
    }

    /** Scores one call over one window. Pure: same inputs, same answer. */
    static Outcome score(TrackedCall c, List<PriceBar> stock, List<PriceBar> spy, int days) {
        String due = LocalDate.parse(c.asOf()).plusDays(days).toString();
        Optional<PriceBar> stockExit = firstOnOrAfter(stock, due);
        Optional<PriceBar> spyExit = firstOnOrAfter(spy, due);
        Optional<PriceBar> spyEntry = onOrBefore(spy, c.asOf());
        if (stockExit.isEmpty() || spyExit.isEmpty() || spyEntry.isEmpty() || c.entryClose() <= 0) return Outcome.pending(days, due);

        double stockReturn = stockExit.get().close() / c.entryClose() - 1;
        double spyReturn = spyExit.get().close() / spyEntry.get().close() - 1;
        double excess = stockReturn - spyReturn;
        return new Outcome(days, "scored", due, stockExit.get().date(), stockReturn, spyReturn, excess, right(c.call(), excess));
    }

    /** The marking rule: was this call right, given the stock's return minus the benchmark's over the same window? */
    static boolean right(String call, double excess) {
        return switch (call) {
            case "BUY" -> excess > 0;
            case "SELL" -> excess < 0;
            default -> Math.abs(excess) <= HOLD_BAND;
        };
    }

    static List<HorizonSummary> summarise(List<ScoredCall> calls) {
        Map<Integer, List<Outcome>> byDays = new LinkedHashMap<>();
        HORIZONS.forEach(d -> byDays.put(d, new ArrayList<>()));
        Map<Outcome, String> callOf = new java.util.IdentityHashMap<>();
    calls.forEach(s -> s.outcomes().forEach(o -> {
            byDays.get(o.days()).add(o);
            callOf.put(o, s.call().call());
        }));
        List<HorizonSummary> out = new ArrayList<>();
        byDays.forEach((days, outcomes) -> {
            List<Outcome> done = outcomes.stream().filter(o -> "scored".equals(o.status())).toList();
            int correct = (int) done.stream().filter(o -> Boolean.TRUE.equals(o.correct())).count();
            Double winRate = done.isEmpty() ? null : (double) correct / done.size();
            var edges = done.stream().filter(o -> !"HOLD".equals(callOf.get(o)))
                    .mapToDouble(o -> "SELL".equals(callOf.get(o)) ? -o.excess() : o.excess()).summaryStatistics();
            Double avgEdge = edges.getCount() == 0 ? null : edges.getAverage();
            out.add(new HorizonSummary(days, done.size(), correct, outcomes.size() - done.size(), winRate, avgEdge));
        });
        return out;
    }

    /** Bars are in date order (ISO dates sort as strings). */
    private static Optional<PriceBar> firstOnOrAfter(List<PriceBar> bars, String date) {
        return bars.stream().filter(b -> b.date().compareTo(date) >= 0).min(Comparator.comparing(PriceBar::date));
    }

    static Optional<PriceBar> onOrBefore(List<PriceBar> bars, String date) {
        return bars.stream().filter(b -> b.date().compareTo(date) <= 0).max(Comparator.comparing(PriceBar::date));
    }
}
