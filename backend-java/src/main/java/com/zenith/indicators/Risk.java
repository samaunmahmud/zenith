package com.zenith.indicators;

import com.zenith.data.PriceBar;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Risk metrics. Pure functions over price series ordered oldest → newest. */
public final class Risk {

    private Risk() {}

    public static double mean(double[] xs) {
        return Arrays.stream(xs).average().orElse(0);
    }

    /** Sample standard deviation (n − 1). */
    public static double stdev(double[] xs) {
        if (xs.length < 2) return 0;
        double m = mean(xs);
        double sum = 0;
        for (double x : xs) sum += (x - m) * (x - m);
        return Math.sqrt(sum / (xs.length - 1));
    }

    public static double[] simpleReturns(double[] closes) {
        double[] out = new double[Math.max(0, closes.length - 1)];
        for (int i = 1; i < closes.length; i++) out[i - 1] = closes[i] / closes[i - 1] - 1;
        return out;
    }

    /** Annualised volatility: stdev of daily log returns × √252, over the last {@code window} sessions. */
    public static Double annualisedVolatility(double[] closes, int window) {
        double[] slice = Arrays.copyOfRange(closes, Math.max(0, closes.length - (window + 1)), closes.length);
        if (slice.length < 21) return null; // under a month of data is too noisy to report
        double[] logReturns = new double[slice.length - 1];
        for (int i = 1; i < slice.length; i++) logReturns[i - 1] = Math.log(slice[i] / slice[i - 1]);
        return stdev(logReturns) * Math.sqrt(Technicals.YEAR);
    }

    public static Double annualisedVolatility(double[] closes) {
        return annualisedVolatility(closes, Technicals.YEAR);
    }

    /** maxDrawdown ≤ 0, e.g. -0.35 = a 35% peak-to-trough fall. */
    public record Drawdown(double maxDrawdown, String peakDate, String troughDate) {}

    /** Largest peak-to-trough fall in closing prices. */
    public static Drawdown maxDrawdown(List<PriceBar> bars) {
        if (bars.size() < 2) return null;
        PriceBar peak = bars.get(0);
        Drawdown result = new Drawdown(0, null, null);
        for (PriceBar bar : bars) {
            if (bar.close() > peak.close()) peak = bar;
            double dd = bar.close() / peak.close() - 1;
            if (dd < result.maxDrawdown()) result = new Drawdown(dd, peak.date(), bar.date());
        }
        return result;
    }

    /**
     * Beta vs a benchmark: cov(asset, benchmark) / var(benchmark) of daily returns, computed only on
     * dates both series share, so holidays and gaps don't misalign the two.
     */
    public static Double beta(List<PriceBar> asset, List<PriceBar> benchmark, int window) {
        Map<String, Double> benchByDate = new HashMap<>();
        for (PriceBar b : benchmark) benchByDate.put(b.date(), b.close());
        List<double[]> pairs = new ArrayList<>();
        for (PriceBar a : asset) {
            Double b = benchByDate.get(a.date());
            if (b != null) pairs.add(new double[] {a.close(), b});
        }
        pairs = pairs.subList(Math.max(0, pairs.size() - (window + 1)), pairs.size());
        if (pairs.size() < 21) return null;

        double[] ra = simpleReturns(pairs.stream().mapToDouble(p -> p[0]).toArray());
        double[] rb = simpleReturns(pairs.stream().mapToDouble(p -> p[1]).toArray());
        double ma = mean(ra);
        double mb = mean(rb);
        double cov = 0;
        double varB = 0;
        for (int i = 0; i < ra.length; i++) {
            cov += (ra[i] - ma) * (rb[i] - mb);
            varB += (rb[i] - mb) * (rb[i] - mb);
        }
        return varB == 0 ? null : cov / varB;
    }

    public static Double beta(List<PriceBar> asset, List<PriceBar> benchmark) {
        return beta(asset, benchmark, Technicals.YEAR);
    }

    public record Liquidity(double avgVolume20d, double avgDollarVolume20d) {}

    public static Liquidity liquidity(List<PriceBar> bars, int window) {
        List<PriceBar> slice = bars.subList(Math.max(0, bars.size() - window), bars.size());
        if (slice.isEmpty()) return null;
        return new Liquidity(
                slice.stream().mapToDouble(PriceBar::volume).average().orElse(0),
                slice.stream().mapToDouble(b -> b.volume() * b.close()).average().orElse(0));
    }
}
