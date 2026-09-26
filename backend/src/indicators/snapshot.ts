// Turns raw market data into (a) numeric indicators and (b) per-analyst "fact sheets":
// label → pre-formatted string. The fact sheets are the ONLY numbers agents ever see.
import type { MarketData } from "../data/types.js";
import { fundamentalMetrics, type FundamentalMetrics } from "./fundamentals.js";
import { NA, compact, fixed, money, pct } from "./format.js";
import { annualisedVolatility, beta, liquidity, maxDrawdown, type Drawdown, type Liquidity } from "./risk.js";
import { macd, periodReturn, range52w, rsi, sma, TRADING_DAYS, type Macd, type Range52w } from "./technicals.js";

export type Facts = Record<string, string>;

export interface Snapshot {
  ticker: string;
  companyName: string;
  sector: string | null;
  industry: string | null;
  currency: string | null;
  asOf: string; // date of the latest close
  lastClose: number;
  marketCap: number | null;
  technicals: {
    return1w: number | null;
    return1m: number | null;
    return3m: number | null;
    return1y: number | null;
    sma20: number | null;
    sma50: number | null;
    sma200: number | null;
    rsi14: number | null;
    macd: Macd | null;
    range52w: Range52w | null;
  };
  risk: {
    volatility1y: number | null;
    benchmarkVolatility1y: number | null;
    maxDrawdown1y: Drawdown | null;
    betaVsSpy: number | null;
    liquidity: Liquidity | null;
  };
  fundamentals: FundamentalMetrics;
  facts: { fundamentals: Facts; technicals: Facts; risk: Facts };
  priceHistory: { date: string; close: number }[]; // last year, for the frontend chart
}

export function buildSnapshot(md: MarketData): Snapshot {
  const bars = md.prices;
  const closes = bars.map((b) => b.close);
  const last = bars[bars.length - 1];
  const yearBars = bars.slice(-(TRADING_DAYS.year + 1));
  const cur = md.profile.currency;

  const technicals = {
    return1w: periodReturn(closes, TRADING_DAYS.week),
    return1m: periodReturn(closes, TRADING_DAYS.month),
    return3m: periodReturn(closes, TRADING_DAYS.quarter),
    return1y: periodReturn(closes, TRADING_DAYS.year),
    sma20: sma(closes, 20),
    sma50: sma(closes, 50),
    sma200: sma(closes, 200),
    rsi14: rsi(closes, 14),
    macd: macd(closes),
    range52w: range52w(bars),
  };
  const risk = {
    volatility1y: annualisedVolatility(closes),
    benchmarkVolatility1y: annualisedVolatility(md.benchmark.map((b) => b.close)),
    maxDrawdown1y: maxDrawdown(yearBars),
    betaVsSpy: beta(bars, md.benchmark),
    liquidity: liquidity(bars),
  };
  const fundamentals = fundamentalMetrics(md.ratios, md.keyMetrics, md.growth);
  const marketCap = md.profile.marketCap;
  const vsSma = (s: number | null) => (s === null ? NA : pct(last.close / s - 1, { signed: true }));

  const priceFacts: Facts = {
    "Last close": money(last.close, cur),
    "Last close date": last.date,
  };

  const facts = {
    fundamentals: {
      Company: md.profile.companyName,
      Sector: md.profile.sector ?? NA,
      Industry: md.profile.industry ?? NA,
      ...priceFacts,
      "Market cap": money(marketCap, cur, true),
      "P/E (TTM)": fixed(fundamentals.peRatio),
      "PEG ratio (TTM)": fixed(fundamentals.pegRatio),
      "Price/Sales (TTM)": fixed(fundamentals.priceToSales),
      "Price/Book (TTM)": fixed(fundamentals.priceToBook),
      "EV/EBITDA (TTM)": fixed(fundamentals.evToEbitda),
      "Gross margin (TTM)": pct(fundamentals.grossMargin),
      "Operating margin (TTM)": pct(fundamentals.operatingMargin),
      "Net margin (TTM)": pct(fundamentals.netMargin),
      "Return on equity (TTM)": pct(fundamentals.returnOnEquity),
      "Debt/Equity (TTM)": fixed(fundamentals.debtToEquity),
      "Current ratio (TTM)": fixed(fundamentals.currentRatio),
      "Free cash flow yield (TTM)": pct(fundamentals.freeCashFlowYield),
      "Dividend yield (TTM)": pct(fundamentals.dividendYield, { digits: 2 }),
      "Revenue growth (last fiscal year)": pct(fundamentals.revenueGrowth, { signed: true }),
      "EPS growth (last fiscal year)": pct(fundamentals.epsGrowth, { signed: true }),
      "Forward P/E": NA, // not on the free data plan; stated explicitly so the model doesn't guess
    },
    technicals: {
      ...priceFacts,
      "1-week return": pct(technicals.return1w, { signed: true }),
      "1-month return": pct(technicals.return1m, { signed: true }),
      "3-month return": pct(technicals.return3m, { signed: true }),
      "1-year return": pct(technicals.return1y, { signed: true }),
      SMA20: money(technicals.sma20, cur),
      SMA50: money(technicals.sma50, cur),
      SMA200: money(technicals.sma200, cur),
      "Price vs SMA20": vsSma(technicals.sma20),
      "Price vs SMA50": vsSma(technicals.sma50),
      "Price vs SMA200": vsSma(technicals.sma200),
      "RSI (14)": fixed(technicals.rsi14, 1),
      "MACD line": fixed(technicals.macd?.macd ?? null),
      "MACD signal": fixed(technicals.macd?.signal ?? null),
      "MACD histogram": fixed(technicals.macd?.histogram ?? null),
      "52-week high": money(technicals.range52w?.high ?? null, cur),
      "52-week low": money(technicals.range52w?.low ?? null, cur),
      "Distance from 52-week high": pct(technicals.range52w?.pctFromHigh ?? null, { signed: true }),
      "Distance from 52-week low": pct(technicals.range52w?.pctFromLow ?? null, { signed: true }),
    },
    risk: {
      ...priceFacts,
      "Market cap": money(marketCap, cur, true),
      "Annualised volatility (1y)": pct(risk.volatility1y),
      "S&P 500 (SPY) annualised volatility (1y)": pct(risk.benchmarkVolatility1y),
      "Beta vs S&P 500 (SPY, 1y daily)": fixed(risk.betaVsSpy),
      "Max drawdown (1y)": pct(risk.maxDrawdown1y?.maxDrawdown ?? null),
      "Max drawdown peak date": risk.maxDrawdown1y?.peakDate ?? NA,
      "Max drawdown trough date": risk.maxDrawdown1y?.troughDate ?? NA,
      "Average daily volume (20d)": risk.liquidity ? `${compact(risk.liquidity.avgVolume20d)} shares` : NA,
      "Average daily dollar volume (20d)": money(risk.liquidity?.avgDollarVolume20d ?? null, cur, true),
      "Debt/Equity (TTM)": fixed(fundamentals.debtToEquity),
      "Current ratio (TTM)": fixed(fundamentals.currentRatio),
    },
  };

  return {
    ticker: md.ticker,
    companyName: md.profile.companyName,
    sector: md.profile.sector,
    industry: md.profile.industry,
    currency: cur,
    asOf: last.date,
    lastClose: last.close,
    marketCap,
    technicals,
    risk,
    fundamentals,
    facts,
    priceHistory: yearBars.map((b) => ({ date: b.date, close: b.close })),
  };
}
