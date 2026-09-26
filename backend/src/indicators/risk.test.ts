import { describe, expect, it } from "vitest";
import type { PriceBar } from "../data/types.js";
import { annualisedVolatility, beta, liquidity, maxDrawdown, stdev } from "./risk.js";

function barsFromCloses(closes: number[], volume = 1_000): PriceBar[] {
  return closes.map((close, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, "0")}`,
    open: close,
    high: close,
    low: close,
    close,
    volume,
  }));
}

describe("stdev", () => {
  it("uses the sample (n-1) definition", () => {
    // mean 5, squared deviations sum = 32, /7 → sqrt(32/7)
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(Math.sqrt(32 / 7));
  });
});

describe("annualisedVolatility", () => {
  it("is zero when every daily return is identical", () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 * 1.01 ** i);
    expect(annualisedVolatility(closes)).toBeCloseTo(0);
  });
  it("matches the closed form for alternating ±a log returns", () => {
    const a = 0.02;
    const n = 30; // number of returns (even, so the mean is exactly 0)
    const closes = [100];
    for (let i = 0; i < n; i++) closes.push(closes[i] * Math.exp(i % 2 === 0 ? a : -a));
    const expected = Math.sqrt((n * a * a) / (n - 1)) * Math.sqrt(252);
    expect(annualisedVolatility(closes)).toBeCloseTo(expected, 10);
  });
  it("returns null for under a month of data", () => {
    expect(annualisedVolatility([100, 101, 102])).toBeNull();
  });
});

describe("maxDrawdown", () => {
  it("finds the largest peak-to-trough fall and its dates", () => {
    const d = maxDrawdown(barsFromCloses([100, 120, 60, 90, 130, 117]))!;
    expect(d.maxDrawdown).toBeCloseTo(-0.5);
    expect(d.peakDate).toBe("2026-01-02");
    expect(d.troughDate).toBe("2026-01-03");
  });
  it("is zero for a rising series", () => {
    expect(maxDrawdown(barsFromCloses([1, 2, 3, 4]))!.maxDrawdown).toBe(0);
  });
});

describe("beta", () => {
  // Benchmark with varied daily returns
  const benchReturns = Array.from({ length: 40 }, (_, i) => Math.sin(i) * 0.01);
  const bench = [100];
  const asset = [50];
  for (const r of benchReturns) {
    bench.push(bench[bench.length - 1] * (1 + r));
    asset.push(asset[asset.length - 1] * (1 + 2 * r)); // exactly twice the benchmark's daily return
  }

  it("is 2 when the asset's returns are exactly twice the benchmark's", () => {
    expect(beta(barsFromCloses(asset), barsFromCloses(bench))).toBeCloseTo(2, 10);
  });
  it("is 1 against itself", () => {
    expect(beta(barsFromCloses(bench), barsFromCloses(bench))).toBeCloseTo(1, 10);
  });
  it("aligns on shared dates only", () => {
    const b = barsFromCloses(bench);
    const a = barsFromCloses(asset);
    // Remove the last benchmark day: that asset day must be ignored, not misaligned.
    expect(beta(a, b.slice(0, -1))).toBeCloseTo(2, 10);
  });
});

describe("liquidity", () => {
  it("averages volume and dollar volume over the window", () => {
    const l = liquidity(barsFromCloses([10, 20], 100), 20)!;
    expect(l.avgVolume20d).toBe(100);
    expect(l.avgDollarVolume20d).toBe(1_500); // (10*100 + 20*100) / 2
  });
});
