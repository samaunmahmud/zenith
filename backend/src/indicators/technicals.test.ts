import { describe, expect, it } from "vitest";
import type { PriceBar } from "../data/types.js";
import { emaSeries, macd, periodReturn, range52w, rsi, sma } from "./technicals.js";

const bar = (date: string, close: number, high = close, low = close): PriceBar => ({
  date,
  open: close,
  high,
  low,
  close,
  volume: 1_000,
});

describe("periodReturn", () => {
  it("computes the simple return over N sessions", () => {
    expect(periodReturn([100, 105, 110], 2)).toBeCloseTo(0.1);
    expect(periodReturn([100, 105, 110], 1)).toBeCloseTo(110 / 105 - 1);
  });
  it("returns null without enough history", () => {
    expect(periodReturn([100, 110], 2)).toBeNull();
  });
});

describe("sma", () => {
  it("averages the last N values", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toBe(4);
    expect(sma([1, 2, 3, 4, 5], 5)).toBe(3);
  });
  it("returns null without enough data", () => {
    expect(sma([1, 2], 3)).toBeNull();
  });
});

describe("emaSeries", () => {
  it("seeds with the SMA then applies k = 2/(n+1)", () => {
    // period 3 → k = 0.5; seed = mean(1,2,3) = 2; then 0.5*4 + 0.5*2 = 3; then 0.5*5 + 0.5*3 = 4
    expect(emaSeries([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
});

describe("rsi (Wilder)", () => {
  it("matches a hand-computed value", () => {
    // period 2, changes +1, -1, +1: seed avgGain = avgLoss = 0.5;
    // next: avgGain = (0.5 + 1)/2 = 0.75, avgLoss = (0.5 + 0)/2 = 0.25 → RS = 3 → RSI = 75
    expect(rsi([1, 2, 1, 2], 2)).toBeCloseTo(75);
  });
  it("is 100 for a series that only rises and 50 for a flat one", () => {
    expect(rsi(Array.from({ length: 30 }, (_, i) => 100 + i))).toBe(100);
    expect(rsi(Array.from({ length: 30 }, () => 100))).toBe(50);
  });
  it("is 0 for a series that only falls", () => {
    expect(rsi(Array.from({ length: 30 }, (_, i) => 100 - i))).toBeCloseTo(0);
  });
  it("returns null without enough data", () => {
    expect(rsi([1, 2, 3], 14)).toBeNull();
  });
});

describe("macd", () => {
  it("is zero on a flat series", () => {
    const m = macd(Array.from({ length: 60 }, () => 50))!;
    expect(m.macd).toBeCloseTo(0);
    expect(m.signal).toBeCloseTo(0);
    expect(m.histogram).toBeCloseTo(0);
  });
  it("equals the EMA lag difference on a linear series", () => {
    // On x_t = t an SMA-seeded EMA lags by exactly (n-1)/2, so MACD = 12.5 - 5.5 = 7.
    const m = macd(Array.from({ length: 100 }, (_, i) => i))!;
    expect(m.macd).toBeCloseTo(7);
    expect(m.signal).toBeCloseTo(7);
    expect(m.histogram).toBeCloseTo(0);
  });
  it("returns null without enough data", () => {
    expect(macd([1, 2, 3])).toBeNull();
  });
});

describe("range52w", () => {
  it("uses intraday highs/lows and measures distance from each", () => {
    const bars = [bar("2026-01-01", 100, 120, 90), bar("2026-01-02", 110, 115, 80), bar("2026-01-03", 96, 100, 95)];
    const r = range52w(bars)!;
    expect(r.high).toBe(120);
    expect(r.low).toBe(80);
    expect(r.pctFromHigh).toBeCloseTo(96 / 120 - 1); // -20%
    expect(r.pctFromLow).toBeCloseTo(96 / 80 - 1); // +20%
  });
});
