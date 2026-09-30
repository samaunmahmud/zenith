package com.zenith.indicators;

import com.zenith.data.PriceBar;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

/**
 * The conditions the chair may put on its watch list: "what would change this call". Code offers them, the chair
 * picks, and code checks them later against new closes.
 *
 * <p>The chair can't write its own triggers because it can't be trusted with thresholds (they'd be invented numbers),
 * and a free-text trigger could never be checked. So every option is price-based, with its threshold fixed here and
 * its reference values taken from the snapshot the committee saw. The menu is deterministic: rebuilding it from a
 * saved snapshot gives the same options, so a saved decision's watch list can be checked for as long as it's shown.
 */
public final class Triggers {

    public static final double MOVE = 0.15;
    public static final double RELATIVE = 0.10;
    public static final double OVERBOUGHT = 70;
    public static final double OVERSOLD = 30;

    /** One option: an id the chair copies, and the condition in words, with its reference figures. */
    public record Trigger(String id, String condition) {}

    /** How a trigger stands now: the first close it was met on (null if not yet), and the current reading. */
    public record Check(String metOn, String now) {}

    private Triggers() {}

    /** The options for a stock at the ruling's close. Only conditions that aren't already true are offered. */
    public static List<Trigger> menu(double close, Snapshot.TechnicalsView t, String currency) {
        List<Trigger> out = new ArrayList<>();
        if (t != null && t.sma200() != null) {
            out.add(close < t.sma200()
                    ? new Trigger("above-200d", "The price closes above its 200-day average (" + Format.money(t.sma200(), currency) + " at the ruling)")
                    : new Trigger("below-200d", "The price closes below its 200-day average (" + Format.money(t.sma200(), currency) + " at the ruling)"));
        }
        if (t != null && t.sma50() != null) {
            out.add(close < t.sma50()
                    ? new Trigger("above-50d", "The price closes above its 50-day average (" + Format.money(t.sma50(), currency) + " at the ruling)")
                    : new Trigger("below-50d", "The price closes below its 50-day average (" + Format.money(t.sma50(), currency) + " at the ruling)"));
        }
        if (t != null && t.rsi14() != null) {
            String now = " (" + Format.fixed(t.rsi14(), 1) + " at the ruling)";
            if (t.rsi14() < OVERBOUGHT) out.add(new Trigger("rsi-above-70", "RSI (14) rises above 70, the usual overbought level" + now));
            if (t.rsi14() > OVERSOLD) out.add(new Trigger("rsi-below-30", "RSI (14) falls below 30, the usual oversold level" + now));
        }
        out.add(new Trigger("up-15", "The price rises 15% from the ruling's close, to " + Format.money(close * (1 + MOVE), currency) + " or more"));
        out.add(new Trigger("down-15", "The price falls 15% from the ruling's close, to " + Format.money(close * (1 - MOVE), currency) + " or less"));
        out.add(new Trigger("beats-spy-10", "The stock beats the S&P 500 by 10 points or more from the ruling's close"));
        out.add(new Trigger("trails-spy-10", "The stock trails the S&P 500 by 10 points or more from the ruling's close"));
        if (t != null && t.range52w() != null) {
            out.add(new Trigger("new-high", "The price closes above its 52-week high of " + Format.money(t.range52w().high(), currency)));
            out.add(new Trigger("new-low", "The price closes below its 52-week low of " + Format.money(t.range52w().low(), currency)));
        }
        return out;
    }

    /**
     * Checks one trigger on every close after {@code asOf}. {@code stock} and {@code spy} are daily bars in date order,
     * including enough history before {@code asOf} for the averages and RSI. Empty for an unknown id.
     */
    public static Optional<Check> check(String id, String asOf, double entryClose, Snapshot.TechnicalsView then,
            List<PriceBar> stock, List<PriceBar> spy) {
        double[] closes = Technicals.closes(stock);
        int first = 0;
        while (first < stock.size() && stock.get(first).date().compareTo(asOf) <= 0) first++;
        if (first >= stock.size() || entryClose <= 0) return Optional.of(new Check(null, "no close since the ruling yet"));
        int last = stock.size() - 1;

        return switch (id) {
            case "above-200d", "below-200d", "above-50d", "below-50d" -> {
                Double[] sma = Technicals.smaSeries(closes, id.endsWith("200d") ? 200 : 50);
                boolean above = id.startsWith("above");
                String met = null;
                for (int i = first; i <= last && met == null; i++) {
                    if (sma[i] != null && (above ? closes[i] > sma[i] : closes[i] < sma[i])) met = stock.get(i).date();
                }
                String name = id.endsWith("200d") ? "200-day" : "50-day";
                String now = sma[last] == null ? Format.NA : Format.signedPct(closes[last] / sma[last] - 1) + " against the " + name + " average";
                yield Optional.of(new Check(met, now));
            }
            case "rsi-above-70", "rsi-below-30" -> {
                boolean up = id.equals("rsi-above-70");
                String met = null;
                Double rsi = null;
                for (int i = first; i <= last; i++) {
                    rsi = Technicals.rsi(Arrays.copyOf(closes, i + 1), 14);
                    if (met == null && rsi != null && (up ? rsi > OVERBOUGHT : rsi < OVERSOLD)) met = stock.get(i).date();
                }
                yield Optional.of(new Check(met, "RSI " + Format.fixed(rsi, 1)));
            }
            case "up-15", "down-15", "new-high", "new-low" -> {
                Double level = switch (id) {
                    case "up-15" -> entryClose * (1 + MOVE);
                    case "down-15" -> entryClose * (1 - MOVE);
                    case "new-high" -> then == null || then.range52w() == null ? null : then.range52w().high();
                    default -> then == null || then.range52w() == null ? null : then.range52w().low();
                };
                if (level == null) yield Optional.empty();
                String met = null;
                for (int i = first; i <= last && met == null; i++) {
                    double c = closes[i];
                    boolean hit = switch (id) {
                        case "up-15" -> c >= level;
                        case "down-15" -> c <= level;
                        case "new-high" -> c > level;
                        default -> c < level;
                    };
                    if (hit) met = stock.get(i).date();
                }
                yield Optional.of(new Check(met, Format.signedPct(closes[last] / entryClose - 1) + " since the ruling"));
            }
            case "beats-spy-10", "trails-spy-10" -> {
                Optional<PriceBar> spyEntry = onOrBefore(spy, asOf);
                if (spyEntry.isEmpty()) yield Optional.of(new Check(null, "S&P 500 data not available"));
                boolean beats = id.equals("beats-spy-10");
                String met = null;
                Double excess = null;
                for (int i = first; i <= last; i++) {
                    Optional<PriceBar> spyDay = onOrBefore(spy, stock.get(i).date());
                    if (spyDay.isEmpty()) continue;
                    excess = (closes[i] / entryClose - 1) - (spyDay.get().close() / spyEntry.get().close() - 1);
                    if (met == null && (beats ? excess >= RELATIVE : excess <= -RELATIVE)) met = stock.get(i).date();
                }
                String now = excess == null ? Format.NA : (excess > 0 ? "+" : "") + Format.fixed(excess * 100, 1) + " points against the S&P 500";
                yield Optional.of(new Check(met, now));
            }
            default -> Optional.empty();
        };
    }

    private static Optional<PriceBar> onOrBefore(List<PriceBar> bars, String date) {
        PriceBar best = null;
        for (PriceBar b : bars) {
            if (b.date().compareTo(date) <= 0) best = b;
            else break;
        }
        return Optional.ofNullable(best);
    }
}
