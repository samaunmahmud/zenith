// Risk metrics. Pure functions over price series ordered oldest → newest.
import type { PriceBar } from "../data/types.js";
import { TRADING_DAYS } from "./technicals.js";

export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation (n − 1). */
export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export function simpleReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) out.push(closes[i] / closes[i - 1] - 1);
  return out;
}

/** Annualised volatility: stdev of daily log returns × √252, over the last `window` sessions. */
export function annualisedVolatility(closes: number[], window: number = TRADING_DAYS.year): number | null {
  const slice = closes.slice(-(window + 1));
  if (slice.length < 21) return null; // under a month of data is too noisy to report
  const logReturns: number[] = [];
  for (let i = 1; i < slice.length; i++) logReturns.push(Math.log(slice[i] / slice[i - 1]));
  return stdev(logReturns) * Math.sqrt(TRADING_DAYS.year);
}

export interface Drawdown {
  maxDrawdown: number; // ≤ 0, e.g. -0.35 = a 35% peak-to-trough fall
  peakDate: string | null;
  troughDate: string | null;
}

/** Largest peak-to-trough fall in closing prices. */
export function maxDrawdown(bars: Pick<PriceBar, "date" | "close">[]): Drawdown | null {
  if (bars.length < 2) return null;
  let peak = bars[0];
  let result: Drawdown = { maxDrawdown: 0, peakDate: null, troughDate: null };
  for (const bar of bars) {
    if (bar.close > peak.close) peak = bar;
    const dd = bar.close / peak.close - 1;
    if (dd < result.maxDrawdown) result = { maxDrawdown: dd, peakDate: peak.date, troughDate: bar.date };
  }
  return result;
}

/**
 * Beta vs a benchmark: cov(asset, benchmark) / var(benchmark) of daily returns,
 * computed only on dates both series share (so holidays/gaps don't misalign them).
 */
export function beta(asset: PriceBar[], benchmark: PriceBar[], window: number = TRADING_DAYS.year): number | null {
  const benchByDate = new Map(benchmark.map((b) => [b.date, b.close]));
  const pairs = asset
    .filter((b) => benchByDate.has(b.date))
    .slice(-(window + 1))
    .map((b) => [b.close, benchByDate.get(b.date)!] as const);
  if (pairs.length < 21) return null;

  const ra = simpleReturns(pairs.map((p) => p[0]));
  const rb = simpleReturns(pairs.map((p) => p[1]));
  const ma = mean(ra);
  const mb = mean(rb);
  let cov = 0;
  let varB = 0;
  for (let i = 0; i < ra.length; i++) {
    cov += (ra[i] - ma) * (rb[i] - mb);
    varB += (rb[i] - mb) ** 2;
  }
  return varB === 0 ? null : cov / varB;
}

export interface Liquidity {
  avgVolume20d: number;
  avgDollarVolume20d: number;
}

export function liquidity(bars: PriceBar[], window = 20): Liquidity | null {
  const slice = bars.slice(-window);
  if (slice.length === 0) return null;
  return {
    avgVolume20d: mean(slice.map((b) => b.volume)),
    avgDollarVolume20d: mean(slice.map((b) => b.volume * b.close)),
  };
}
