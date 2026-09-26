package com.zenith.indicators;

import java.util.List;
import java.util.Map;

/**
 * The computed view of one stock: numeric indicators plus per-analyst "fact sheets"
 * (label → pre-formatted string). The fact sheets are the ONLY numbers the agents ever see.
 */
public record Snapshot(
        String ticker,
        String companyName,
        String sector,
        String industry,
        String currency,
        String asOf,
        double lastClose,
        Double marketCap,
        TechnicalsView technicals,
        RiskView risk,
        Fundamentals.Metrics fundamentals,
        Facts facts,
        List<PricePoint> priceHistory) {

    public record TechnicalsView(
            Double return1w,
            Double return1m,
            Double return3m,
            Double return1y,
            Double sma20,
            Double sma50,
            Double sma200,
            Double rsi14,
            Technicals.Macd macd,
            Technicals.Range52w range52w) {}

    public record RiskView(
            Double volatility1y,
            Double benchmarkVolatility1y,
            Risk.Drawdown maxDrawdown1y,
            Double betaVsSpy,
            Risk.Liquidity liquidity) {}

    public record Facts(Map<String, String> fundamentals, Map<String, String> technicals, Map<String, String> risk) {}

    /** One day on the price chart, with moving averages computed in Java (null before enough history). */
    public record PricePoint(String date, double close, Double sma50, Double sma200) {}
}
