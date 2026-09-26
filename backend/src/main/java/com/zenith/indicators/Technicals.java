package com.zenith.indicators;

import com.zenith.data.PriceBar;
import java.util.ArrayList;
import java.util.List;

/**
 * Technical indicators. Pure functions over closing prices ordered oldest → newest.
 * They return null when there isn't enough data, rather than a misleading number.
 */
public final class Technicals {

    public static final int WEEK = 5;
    public static final int MONTH = 21;
    public static final int QUARTER = 63;
    public static final int YEAR = 252;

    private Technicals() {}

    /** Simple return over the last {@code days} sessions, e.g. 0.05 = +5%. */
    public static Double periodReturn(double[] closes, int days) {
        if (closes.length <= days) return null;
        double past = closes[closes.length - 1 - days];
        return past == 0 ? null : closes[closes.length - 1] / past - 1;
    }

    /** Simple moving average of the last {@code period} values. */
    public static Double sma(double[] values, int period) {
        if (period <= 0 || values.length < period) return null;
        double sum = 0;
        for (int i = values.length - period; i < values.length; i++) sum += values[i];
        return sum / period;
    }

    /** Rolling SMA for every index (null until there are {@code period} values). Used for the price chart. */
    public static Double[] smaSeries(double[] values, int period) {
        Double[] out = new Double[values.length];
        if (period <= 0) return out;
        double sum = 0;
        for (int i = 0; i < values.length; i++) {
            sum += values[i];
            if (i >= period) sum -= values[i - period];
            if (i >= period - 1) out[i] = sum / period;
        }
        return out;
    }

    /**
     * EMA series seeded with the SMA of the first {@code period} values. Entries before the seed are
     * null, so the output lines up index-for-index with the input.
     */
    public static Double[] emaSeries(double[] values, int period) {
        Double[] out = new Double[values.length];
        if (period <= 0 || values.length < period) return out;
        double k = 2.0 / (period + 1);
        double prev = 0;
        for (int i = 0; i < period; i++) prev += values[i];
        prev /= period;
        out[period - 1] = prev;
        for (int i = period; i < values.length; i++) {
            prev = values[i] * k + prev * (1 - k);
            out[i] = prev;
        }
        return out;
    }

    /** Relative Strength Index with Wilder's smoothing (the standard definition). */
    public static Double rsi(double[] closes, int period) {
        if (closes.length <= period) return null;
        double gain = 0;
        double loss = 0;
        for (int i = 1; i <= period; i++) {
            double change = closes[i] - closes[i - 1];
            if (change > 0) gain += change;
            else loss -= change;
        }
        double avgGain = gain / period;
        double avgLoss = loss / period;
        for (int i = period + 1; i < closes.length; i++) {
            double change = closes[i] - closes[i - 1];
            avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
            avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
        }
        if (avgLoss == 0) return avgGain == 0 ? 50.0 : 100.0;
        return 100 - 100 / (1 + avgGain / avgLoss);
    }

    public record Macd(double macd, double signal, double histogram) {}

    /** MACD(12, 26, 9): fast EMA − slow EMA, with an EMA signal line of that difference. */
    public static Macd macd(double[] closes, int fast, int slow, int signalPeriod) {
        Double[] fastEma = emaSeries(closes, fast);
        Double[] slowEma = emaSeries(closes, slow);
        List<Double> line = new ArrayList<>();
        for (int i = 0; i < closes.length; i++) {
            if (fastEma[i] != null && slowEma[i] != null) line.add(fastEma[i] - slowEma[i]);
        }
        double[] lineArr = line.stream().mapToDouble(Double::doubleValue).toArray();
        Double[] signal = emaSeries(lineArr, signalPeriod);
        if (lineArr.length == 0 || signal[signal.length - 1] == null) return null;
        double m = lineArr[lineArr.length - 1];
        double s = signal[signal.length - 1];
        return new Macd(m, s, m - s);
    }

    public static Macd macd(double[] closes) {
        return macd(closes, 12, 26, 9);
    }

    public record Range52w(double high, double low, double pctFromHigh, double pctFromLow) {}

    /** 52-week high/low (intraday highs/lows over the last 252 sessions) and distance from each. */
    public static Range52w range52w(List<PriceBar> bars) {
        if (bars.isEmpty()) return null;
        List<PriceBar> window = bars.subList(Math.max(0, bars.size() - YEAR), bars.size());
        double high = window.stream().mapToDouble(PriceBar::high).max().orElseThrow();
        double low = window.stream().mapToDouble(PriceBar::low).min().orElseThrow();
        double last = bars.get(bars.size() - 1).close();
        return new Range52w(high, low, last / high - 1, last / low - 1);
    }

    public static double[] closes(List<PriceBar> bars) {
        return bars.stream().mapToDouble(PriceBar::close).toArray();
    }
}
