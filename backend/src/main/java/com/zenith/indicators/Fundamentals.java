package com.zenith.indicators;

import java.util.Map;

/**
 * Picks the metrics we care about out of raw FMP payloads. No maths is invented here: these are the
 * provider's reported values, normalised. Fractions throughout (0.45 = 45%).
 */
public final class Fundamentals {

    public record Metrics(
            Double peRatio,
            Double pegRatio,
            Double priceToSales,
            Double priceToBook,
            Double evToEbitda,
            Double grossMargin,
            Double operatingMargin,
            Double netMargin,
            Double returnOnEquity,
            Double debtToEquity,
            Double currentRatio,
            Double freeCashFlowYield,
            Double dividendYield,
            Double revenueGrowth, // latest fiscal year, YoY
            Double epsGrowth) {}

    private Fundamentals() {}

    /** First finite number found under any of the keys (FMP renamed fields between API versions). */
    public static Double pickNumber(Map<String, Object> record, String... keys) {
        for (String key : keys) {
            Object v = record.get(key);
            if (v instanceof Number n && Double.isFinite(n.doubleValue())) return n.doubleValue();
            if (v instanceof String s && !s.isBlank()) {
                try {
                    double d = Double.parseDouble(s.trim());
                    if (Double.isFinite(d)) return d;
                } catch (NumberFormatException ignored) {
                    // not a number: try the next key
                }
            }
        }
        return null;
    }

    private static Double firstNonNull(Double a, Double b) {
        return a != null ? a : b;
    }

    public static Metrics metrics(Map<String, Object> ratios, Map<String, Object> keyMetrics, Map<String, Object> growth) {
        return new Metrics(
                firstNonNull(pickNumber(ratios, "priceToEarningsRatioTTM", "peRatioTTM"), pickNumber(keyMetrics, "peRatioTTM")),
                pickNumber(ratios, "priceToEarningsGrowthRatioTTM", "pegRatioTTM"),
                pickNumber(ratios, "priceToSalesRatioTTM"),
                pickNumber(ratios, "priceToBookRatioTTM"),
                pickNumber(keyMetrics, "evToEBITDATTM", "enterpriseValueOverEBITDATTM"),
                pickNumber(ratios, "grossProfitMarginTTM"),
                pickNumber(ratios, "operatingProfitMarginTTM"),
                pickNumber(ratios, "netProfitMarginTTM"),
                firstNonNull(pickNumber(keyMetrics, "returnOnEquityTTM", "roeTTM"), pickNumber(ratios, "returnOnEquityTTM")),
                pickNumber(ratios, "debtToEquityRatioTTM", "debtEquityRatioTTM"),
                firstNonNull(pickNumber(ratios, "currentRatioTTM"), pickNumber(keyMetrics, "currentRatioTTM")),
                pickNumber(keyMetrics, "freeCashFlowYieldTTM"),
                pickNumber(ratios, "dividendYieldTTM"),
                pickNumber(growth, "revenueGrowth"),
                pickNumber(growth, "epsgrowth", "epsGrowth"));
    }
}
