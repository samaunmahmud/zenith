import { describe, expect, it } from "vitest";
import { compact, money, pct } from "./format.js";
import { fundamentalMetrics, pickNumber } from "./fundamentals.js";

describe("pickNumber", () => {
  it("returns the first finite number across fallback keys", () => {
    expect(pickNumber({ a: null, b: 3.5 }, ["a", "b"])).toBe(3.5);
    expect(pickNumber({ a: "2.5" }, ["a"])).toBe(2.5);
    expect(pickNumber({ a: "n/a", b: Infinity }, ["a", "b"])).toBeNull();
  });
});

describe("fundamentalMetrics", () => {
  it("maps current and legacy FMP field names", () => {
    const m = fundamentalMetrics({ peRatioTTM: 30, grossProfitMarginTTM: 0.45 }, { roeTTM: 1.5 }, { epsgrowth: 0.1 });
    expect(m.peRatio).toBe(30);
    expect(m.grossMargin).toBe(0.45);
    expect(m.returnOnEquity).toBe(1.5);
    expect(m.epsGrowth).toBe(0.1);
    expect(m.debtToEquity).toBeNull();
  });
});

describe("format", () => {
  it("formats percentages, compact numbers and money", () => {
    expect(pct(0.1234)).toBe("12.3%");
    expect(pct(0.05, { signed: true })).toBe("+5.0%");
    expect(pct(-0.05, { signed: true })).toBe("-5.0%");
    expect(pct(null)).toBe("not available");
    expect(compact(2_950_000_000_000)).toBe("2.95T");
    expect(compact(52_300_000)).toBe("52.30M");
    expect(money(182.5, "USD")).toBe("$182.50");
    expect(money(1_500_000_000, "EUR", true)).toBe("1.50B EUR");
  });
});
