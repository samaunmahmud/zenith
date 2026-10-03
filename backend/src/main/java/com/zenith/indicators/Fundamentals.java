package com.zenith.indicators;

import java.util.Map;

/**
 * Picks the metrics we care about out of raw FMP payloads, falling back field by field to Finnhub's basic
 * financials. No maths is invented here: these are the providers' reported values, normalised (the one derived
 * value, free cash flow yield from Finnhub's price/FCF, is its exact reciprocal). Fractions throughout (0.45 = 45%).
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
            Double revenueGrowth, // latest fiscal year YoY (FMP), or trailing twelve months YoY (Finnhub): see growthTtm
            Double epsGrowth,
            Double forwardPe,
            boolean growthTtm) {}

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

    /** Finnhub reports percentages as 12.5, not 0.125. */
    private static Double percent(Map<String, Object> finnhub, String... keys) {
        Double v = pickNumber(finnhub, keys);
        return v == null ? null : v / 100;
    }

    public static Metrics metrics(Map<String, Object> ratios, Map<String, Object> keyMetrics, Map<String, Object> growth) {
        return metrics(ratios, keyMetrics, growth, Map.of());
    }

    public static Metrics metrics(Map<String, Object> ratios, Map<String, Object> keyMetrics, Map<String, Object> growth,
            Map<String, Object> finnhub) {
        Double revenueGrowth = pickNumber(growth, "revenueGrowth");
        Double epsGrowth = pickNumber(growth, "epsgrowth", "epsGrowth");
        // Growth comes from one source for both lines, so the label can say which basis it is.
        boolean growthTtm = revenueGrowth == null && epsGrowth == null;
        if (growthTtm) {
            revenueGrowth = percent(finnhub, "revenueGrowthTTMYoy");
            epsGrowth = percent(finnhub, "epsGrowthTTMYoy");
        }
        Double priceToFcf = pickNumber(finnhub, "pfcfShareTTM");
        return new Metrics(
                firstNonNull(firstNonNull(pickNumber(ratios, "priceToEarningsRatioTTM", "peRatioTTM"), pickNumber(keyMetrics, "peRatioTTM")),
                        pickNumber(finnhub, "peTTM")),
                firstNonNull(pickNumber(ratios, "priceToEarningsGrowthRatioTTM", "pegRatioTTM"), pickNumber(finnhub, "pegTTM")),
                firstNonNull(pickNumber(ratios, "priceToSalesRatioTTM"), pickNumber(finnhub, "psTTM")),
                firstNonNull(pickNumber(ratios, "priceToBookRatioTTM"), pickNumber(finnhub, "pbQuarterly", "pb")),
                firstNonNull(pickNumber(keyMetrics, "evToEBITDATTM", "enterpriseValueOverEBITDATTM"), pickNumber(finnhub, "evEbitdaTTM")),
                firstNonNull(pickNumber(ratios, "grossProfitMarginTTM"), percent(finnhub, "grossMarginTTM")),
                firstNonNull(pickNumber(ratios, "operatingProfitMarginTTM"), percent(finnhub, "operatingMarginTTM")),
                firstNonNull(pickNumber(ratios, "netProfitMarginTTM"), percent(finnhub, "netProfitMarginTTM")),
                firstNonNull(firstNonNull(pickNumber(keyMetrics, "returnOnEquityTTM", "roeTTM"), pickNumber(ratios, "returnOnEquityTTM")),
                        percent(finnhub, "roeTTM")),
                firstNonNull(pickNumber(ratios, "debtToEquityRatioTTM", "debtEquityRatioTTM"),
                        pickNumber(finnhub, "totalDebt/totalEquityQuarterly", "totalDebt/totalEquityAnnual")),
                firstNonNull(firstNonNull(pickNumber(ratios, "currentRatioTTM"), pickNumber(keyMetrics, "currentRatioTTM")),
                        pickNumber(finnhub, "currentRatioQuarterly", "currentRatioAnnual")),
                firstNonNull(pickNumber(keyMetrics, "freeCashFlowYieldTTM"), priceToFcf == null || priceToFcf == 0 ? null : 1 / priceToFcf),
                firstNonNull(pickNumber(ratios, "dividendYieldTTM"), percent(finnhub, "currentDividendYieldTTM", "dividendYieldIndicatedAnnual")),
                revenueGrowth,
                epsGrowth,
                pickNumber(finnhub, "forwardPE"),
                growthTtm);
    }
}
