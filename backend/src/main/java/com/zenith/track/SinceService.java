package com.zenith.track;

import com.zenith.committee.CommitteeResult;
import com.zenith.committee.CommitteeRunner;
import com.zenith.data.MarketDataService;
import com.zenith.data.PriceBar;
import com.zenith.indicators.Format;
import com.zenith.indicators.Snapshot;
import com.zenith.indicators.Technicals;
import com.zenith.indicators.Triggers;
import com.zenith.schema.WatchItem;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * What has happened since the committee last ruled on a stock: how the price and the S&amp;P 500 have moved, whether
 * the call is on track so far, and whether the technical picture the committee saw still holds.
 *
 * <p>A saved decision can be served for weeks, so the page needs to say how it has aged. Everything here is
 * arithmetic on daily closes: no model is called, and "on track" uses the track record's rule
 * ({@link TrackRecordService#right}). It is a running mark, not a score; scores are only given at 7, 30 and 90 days.
 */
@Service
public class SinceService {

    private static final Logger log = LoggerFactory.getLogger(SinceService.class);

    /** One figure the committee saw, next to the same figure on the latest close. Both are formatted here. */
    public record Drift(String label, String then, String now) {}

    /**
     * {@code tradingDays} is the number of completed closes after {@code asOf}; when it is 0, the returns and
     * {@code onTrack} are null. Returns are fractions (0.05 = +5%).
     */
    public record Since(String ticker, String call, String asOf, double entryClose, String latestDate, double latestClose,
            int tradingDays, Double stockReturn, Double spyReturn, Double excess, Boolean onTrack, String benchmark, int holdBandPct,
            List<Drift> drift, List<String> notes, List<Watch> watch) {

        Since withWatch(List<Watch> w) {
            return new Since(ticker, call, asOf, entryClose, latestDate, latestClose, tradingDays, stockReturn, spyReturn, excess,
                    onTrack, benchmark, holdBandPct, drift, notes, w);
        }
    }

    /**
     * One item on the chair's watch list, checked: {@code metOn} is the first close that met the condition (null if
     * none has yet), and {@code now} is the current reading, e.g. "-10.6% against the 200-day average".
     */
    public record Watch(String trigger, String condition, String wouldMoveTo, String reason, String metOn, String now) {}

    private final CommitteeRunner committee;
    private final TrackRecordService.Prices prices;

    @Autowired
    public SinceService(CommitteeRunner committee, MarketDataService marketData) {
        this(committee, t -> marketData.prices(t).data());
    }

    SinceService(CommitteeRunner committee, TrackRecordService.Prices prices) {
        this.committee = committee;
        this.prices = prices;
    }

    /** Empty when there is no saved decision for the ticker, or no prices to measure it against. */
    public Optional<Since> since(String ticker) {
        Optional<CommitteeResult> saved = committee.lastSavedRun(ticker).filter(r -> r.decision() != null && r.snapshot() != null);
        if (saved.isEmpty()) return Optional.empty();
        try {
            Snapshot s = saved.get().snapshot();
            List<PriceBar> stock, spy;
            // The stock and the benchmark are independent reads: load them side by side.
            try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
                Future<List<PriceBar>> benchmark = pool.submit(() -> prices.daily(MarketDataService.BENCHMARK));
                stock = prices.daily(ticker);
                spy = benchmark.get();
            } catch (ExecutionException e) {
                throw e.getCause() instanceof RuntimeException re ? re : new IllegalStateException(e.getCause());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return Optional.empty();
            }
            return Optional.of(compute(ticker, saved.get().decision().recommendation().name(), s.asOf(), s.lastClose(), s.technicals(),
                    s.currency(), stock, spy).withWatch(watch(s, saved.get().decision().watchFor(), stock, spy)));
        } catch (RuntimeException e) {
            log.warn("Since the ruling: no prices for {}: {}", ticker, e.getMessage());
            return Optional.empty();
        }
    }

    /** Pure: same inputs, same answer. Bars are in date order. */
    static Since compute(String ticker, String call, String asOf, double entryClose, Snapshot.TechnicalsView then, String currency,
            List<PriceBar> stock, List<PriceBar> spy) {
        List<PriceBar> after = stock.stream().filter(b -> b.date().compareTo(asOf) > 0).toList();
        if (after.isEmpty() || entryClose <= 0) {
            return new Since(ticker, call, asOf, entryClose, asOf, entryClose, 0, null, null, null, null, MarketDataService.BENCHMARK,
                    TrackRecordService.HOLD_BAND_PCT, List.of(), List.of(), List.of());
        }
        PriceBar latest = after.getLast();
        double stockReturn = latest.close() / entryClose - 1;

        // The benchmark over the same days. If it's missing, the stock's own move is still shown, unjudged.
        Optional<PriceBar> spyEntry = TrackRecordService.onOrBefore(spy, asOf);
        Optional<PriceBar> spyExit = TrackRecordService.onOrBefore(spy, latest.date());
        Double spyReturn = null, excess = null;
        Boolean onTrack = null;
        if (spyEntry.isPresent() && spyExit.isPresent() && spyExit.get().date().compareTo(asOf) > 0) {
            spyReturn = spyExit.get().close() / spyEntry.get().close() - 1;
            excess = stockReturn - spyReturn;
            onTrack = TrackRecordService.right(call, excess);
        }

        double[] closes = Technicals.closes(stock);
        Double rsi = Technicals.rsi(closes, 14);
        Double sma50 = Technicals.sma(closes, 50);
        Double sma200 = Technicals.sma(closes, 200);

        List<Drift> drift = new ArrayList<>();
        drift.add(new Drift("Close", Format.money(entryClose, currency), Format.money(latest.close(), currency)));
        List<String> notes = new ArrayList<>();
        if (then != null) {
            drift.add(new Drift("RSI (14)", Format.fixed(then.rsi14(), 1), Format.fixed(rsi, 1)));
            drift.add(new Drift("Against 50-day average", gap(entryClose, then.sma50()), gap(latest.close(), sma50)));
            drift.add(new Drift("Against 200-day average", gap(entryClose, then.sma200()), gap(latest.close(), sma200)));
            crossed(entryClose, then.sma50(), latest.close(), sma50, "50-day").ifPresent(notes::add);
            crossed(entryClose, then.sma200(), latest.close(), sma200, "200-day").ifPresent(notes::add);
            if (then.rsi14() != null && rsi != null) {
                if (then.rsi14() < Triggers.OVERBOUGHT && rsi >= Triggers.OVERBOUGHT) notes.add("RSI has risen above 70, the usual overbought level.");
                if (then.rsi14() > Triggers.OVERSOLD && rsi <= Triggers.OVERSOLD) notes.add("RSI has fallen below 30, the usual oversold level.");
            }
        }
        return new Since(ticker, call, asOf, entryClose, latest.date(), latest.close(), after.size(), stockReturn, spyReturn, excess,
                onTrack, MarketDataService.BENCHMARK, TrackRecordService.HOLD_BAND_PCT, drift, notes, List.of());
    }

    /** Checks each item on the chair's watch list against the closes since the ruling. Empty for older decisions. */
    static List<Watch> watch(Snapshot s, List<WatchItem> items, List<PriceBar> stock, List<PriceBar> spy) {
        if (items == null || s.triggers() == null) return List.of();
        List<Watch> out = new ArrayList<>();
        for (WatchItem w : items) {
            Optional<Triggers.Trigger> t = s.triggers().stream().filter(x -> x.id().equals(w.trigger())).findFirst();
            Optional<Triggers.Check> c = Triggers.check(w.trigger(), s.asOf(), s.lastClose(), s.technicals(), stock, spy);
            if (t.isEmpty() || c.isEmpty()) continue;
            out.add(new Watch(w.trigger(), t.get().condition(), w.wouldMoveTo().name(), w.reason(), c.get().metOn(), c.get().now()));
        }
        return out;
    }

    /** How far a close sits from an average, e.g. "+6.9%". */
    private static String gap(double close, Double average) {
        return average == null || average == 0 ? Format.NA : Format.signedPct(close / average - 1);
    }

    private static Optional<String> crossed(double thenClose, Double thenAvg, double nowClose, Double nowAvg, String name) {
        if (thenAvg == null || nowAvg == null) return Optional.empty();
        boolean wasAbove = thenClose > thenAvg, isAbove = nowClose > nowAvg;
        if (wasAbove == isAbove) return Optional.empty();
        return Optional.of("The price has crossed " + (isAbove ? "above" : "below") + " its " + name + " average since the ruling.");
    }
}
