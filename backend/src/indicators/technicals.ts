// Technical indicators. Pure functions over closing prices ordered oldest → newest.
// Every function returns null when there isn't enough data, rather than a misleading number.
import type { PriceBar } from "../data/types.js";

export const TRADING_DAYS = { week: 5, month: 21, quarter: 63, year: 252 } as const;

/** Simple return over the last `days` trading days, e.g. 0.05 = +5%. */
export function periodReturn(closes: number[], days: number): number | null {
  if (closes.length <= days) return null;
  const past = closes[closes.length - 1 - days];
  return past === 0 ? null : closes[closes.length - 1] / past - 1;
}

/** Simple moving average of the last `period` values. */
export function sma(values: number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

/**
 * Exponential moving average series, seeded with the SMA of the first `period` values.
 * Entries before the seed are null, so the output lines up index-for-index with the input.
 */
export function emaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Relative Strength Index with Wilder's smoothing (the standard definition). */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gain += change;
    else loss -= change;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export interface Macd {
  macd: number;
  signal: number;
  histogram: number;
}

/** MACD(12, 26, 9): fast EMA − slow EMA, with an EMA signal line of that difference. */
export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9): Macd | null {
  const fastEma = emaSeries(closes, fast);
  const slowEma = emaSeries(closes, slow);
  const line: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    const f = fastEma[i];
    const s = slowEma[i];
    if (f !== null && s !== null) line.push(f - s);
  }
  const signal = emaSeries(line, signalPeriod);
  const lastSignal = signal[signal.length - 1];
  if (line.length === 0 || lastSignal === null || lastSignal === undefined) return null;
  const lastMacd = line[line.length - 1];
  return { macd: lastMacd, signal: lastSignal, histogram: lastMacd - lastSignal };
}

export interface Range52w {
  high: number;
  low: number;
  pctFromHigh: number; // ≤ 0, e.g. -0.12 = 12% below the high
  pctFromLow: number; // ≥ 0
}

/** 52-week high/low (intraday highs/lows over the last 252 sessions) and distance from each. */
export function range52w(bars: PriceBar[]): Range52w | null {
  if (bars.length === 0) return null;
  const window = bars.slice(-TRADING_DAYS.year);
  const high = Math.max(...window.map((b) => b.high));
  const low = Math.min(...window.map((b) => b.low));
  const last = bars[bars.length - 1].close;
  return { high, low, pctFromHigh: last / high - 1, pctFromLow: last / low - 1 };
}
