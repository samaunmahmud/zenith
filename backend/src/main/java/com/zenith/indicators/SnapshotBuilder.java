package com.zenith.indicators;

import static com.zenith.indicators.Format.NA;
import static com.zenith.indicators.Format.compact;
import static com.zenith.indicators.Format.fixed;
import static com.zenith.indicators.Format.money;
import static com.zenith.indicators.Format.pct;
import static com.zenith.indicators.Format.signedPct;

import com.zenith.data.MarketData;
import com.zenith.data.PriceBar;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Turns raw market data into a {@link Snapshot}. Deterministic: same input, same output. */
public final class SnapshotBuilder {

    private SnapshotBuilder() {}

    public static Snapshot build(MarketData md) {
        List<PriceBar> bars = md.prices();
        double[] closes = Technicals.closes(bars);
        PriceBar last = bars.get(bars.size() - 1);
        List<PriceBar> yearBars = bars.subList(Math.max(0, bars.size() - (Technicals.YEAR + 1)), bars.size());
        String cur = md.profile().currency();

        var t = new Snapshot.TechnicalsView(
                Technicals.periodReturn(closes, Technicals.WEEK),
                Technicals.periodReturn(closes, Technicals.MONTH),
                Technicals.periodReturn(closes, Technicals.QUARTER),
                Technicals.periodReturn(closes, Technicals.YEAR),
                Technicals.sma(closes, 20),
                Technicals.sma(closes, 50),
                Technicals.sma(closes, 200),
                Technicals.rsi(closes, 14),
                Technicals.macd(closes),
                Technicals.range52w(bars));
        var r = new Snapshot.RiskView(
                Risk.annualisedVolatility(closes),
                Risk.annualisedVolatility(Technicals.closes(md.benchmark())),
                Risk.maxDrawdown(yearBars),
                Risk.beta(bars, md.benchmark()),
                Risk.liquidity(bars, 20));
        var f = Fundamentals.metrics(md.ratios(), md.keyMetrics(), md.growth(), md.finnhubMetrics());
        Double marketCap = md.profile().marketCap();

        Map<String, String> priceFacts = new LinkedHashMap<>();
        priceFacts.put("Last close", money(last.close(), cur));
        priceFacts.put("Last close date", last.date());

        Map<String, String> fundamentals = new LinkedHashMap<>();
        fundamentals.put("Company", md.profile().companyName());
        fundamentals.put("Sector", Objects.requireNonNullElse(md.profile().sector(), NA));
        fundamentals.put("Industry", Objects.requireNonNullElse(md.profile().industry(), NA));
        fundamentals.putAll(priceFacts);
        fundamentals.put("Market cap", money(marketCap, cur, true));
        fundamentals.put("P/E (TTM)", fixed(f.peRatio()));
        fundamentals.put("PEG ratio (TTM)", fixed(f.pegRatio()));
        fundamentals.put("Price/Sales (TTM)", fixed(f.priceToSales()));
        fundamentals.put("Price/Book (TTM)", fixed(f.priceToBook()));
        fundamentals.put("EV/EBITDA (TTM)", fixed(f.evToEbitda()));
        fundamentals.put("Gross margin (TTM)", pct(f.grossMargin()));
        fundamentals.put("Operating margin (TTM)", pct(f.operatingMargin()));
        fundamentals.put("Net margin (TTM)", pct(f.netMargin()));
        fundamentals.put("Return on equity (TTM)", pct(f.returnOnEquity()));
        fundamentals.put("Debt/Equity (TTM)", fixed(f.debtToEquity()));
        fundamentals.put("Current ratio (TTM)", fixed(f.currentRatio()));
        fundamentals.put("Free cash flow yield (TTM)", pct(f.freeCashFlowYield()));
        fundamentals.put("Dividend yield (TTM)", pct(f.dividendYield(), false, 2));
        String basis = f.growthTtm() ? "(TTM, year on year)" : "(last fiscal year)";
        fundamentals.put("Revenue growth " + basis, signedPct(f.revenueGrowth()));
        fundamentals.put("EPS growth " + basis, signedPct(f.epsGrowth()));
        fundamentals.put("Forward P/E", fixed(f.forwardPe())); // N/A when missing, stated so the model doesn't guess

        Map<String, String> technicals = new LinkedHashMap<>(priceFacts);
        technicals.put("1-week return", signedPct(t.return1w()));
        technicals.put("1-month return", signedPct(t.return1m()));
        technicals.put("3-month return", signedPct(t.return3m()));
        technicals.put("1-year return", signedPct(t.return1y()));
        technicals.put("SMA20", money(t.sma20(), cur));
        technicals.put("SMA50", money(t.sma50(), cur));
        technicals.put("SMA200", money(t.sma200(), cur));
        technicals.put("Price vs SMA20", vsSma(last.close(), t.sma20()));
        technicals.put("Price vs SMA50", vsSma(last.close(), t.sma50()));
        technicals.put("Price vs SMA200", vsSma(last.close(), t.sma200()));
        technicals.put("RSI (14)", fixed(t.rsi14(), 1));
        technicals.put("MACD line", t.macd() == null ? NA : fixed(t.macd().macd()));
        technicals.put("MACD signal", t.macd() == null ? NA : fixed(t.macd().signal()));
        technicals.put("MACD histogram", t.macd() == null ? NA : fixed(t.macd().histogram()));
        technicals.put("52-week high", t.range52w() == null ? NA : money(t.range52w().high(), cur));
        technicals.put("52-week low", t.range52w() == null ? NA : money(t.range52w().low(), cur));
        technicals.put("Distance from 52-week high", t.range52w() == null ? NA : signedPct(t.range52w().pctFromHigh()));
        technicals.put("Distance from 52-week low", t.range52w() == null ? NA : signedPct(t.range52w().pctFromLow()));

        Map<String, String> risk = new LinkedHashMap<>(priceFacts);
        risk.put("Market cap", money(marketCap, cur, true));
        risk.put("Annualised volatility (1y)", pct(r.volatility1y()));
        risk.put("S&P 500 (SPY) annualised volatility (1y)", pct(r.benchmarkVolatility1y()));
        risk.put("Beta vs S&P 500 (SPY, 1y daily)", fixed(r.betaVsSpy()));
        risk.put("Max drawdown (1y)", r.maxDrawdown1y() == null ? NA : pct(r.maxDrawdown1y().maxDrawdown()));
        risk.put("Max drawdown peak date", r.maxDrawdown1y() == null ? NA : Objects.requireNonNullElse(r.maxDrawdown1y().peakDate(), NA));
        risk.put("Max drawdown trough date", r.maxDrawdown1y() == null ? NA : Objects.requireNonNullElse(r.maxDrawdown1y().troughDate(), NA));
        risk.put("Average daily volume (20d)", r.liquidity() == null ? NA : compact(r.liquidity().avgVolume20d()) + " shares");
        risk.put("Average daily dollar volume (20d)", r.liquidity() == null ? NA : money(r.liquidity().avgDollarVolume20d(), cur, true));
        risk.put("Debt/Equity (TTM)", fixed(f.debtToEquity()));
        risk.put("Current ratio (TTM)", fixed(f.currentRatio()));

        return new Snapshot(
                md.ticker(),
                md.profile().companyName(),
                md.profile().sector(),
                md.profile().industry(),
                cur,
                last.date(),
                last.close(),
                marketCap,
                t,
                r,
                f,
                new Snapshot.Facts(fundamentals, technicals, risk),
                priceHistory(bars, closes, yearBars.size()),
                Triggers.menu(last.close(), t, cur));
    }

    /** The last {@code days} points, each with its SMA50 and SMA200 (computed over the full history). */
    private static List<Snapshot.PricePoint> priceHistory(List<PriceBar> bars, double[] closes, int days) {
        Double[] sma50 = Technicals.smaSeries(closes, 50);
        Double[] sma200 = Technicals.smaSeries(closes, 200);
        List<Snapshot.PricePoint> out = new java.util.ArrayList<>();
        for (int i = bars.size() - days; i < bars.size(); i++) {
            out.add(new Snapshot.PricePoint(bars.get(i).date(), closes[i], sma50[i], sma200[i]));
        }
        return out;
    }

    private static String vsSma(double close, Double sma) {
        return sma == null ? NA : signedPct(close / sma - 1);
    }
}
