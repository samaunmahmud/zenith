import { describe, expect, it } from "vitest";
import { ago, compactMoney, money, pct, safeUrl, toneOf, usd } from "./format";

describe("format", () => {
  it("only lets http(s) links from third-party data through", () => {
    expect(safeUrl("https://finnhub.io/a?b=1")).toBe("https://finnhub.io/a?b=1");
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("JaVaScRiPt:alert(1)")).toBeNull();
    expect(safeUrl("data:text/html,<script>x</script>")).toBeNull();
    expect(safeUrl("not a url")).toBeNull();
    expect(safeUrl("")).toBeNull();
  });

  it("formats compact money and percentages, showing n/a for missing or non-finite values", () => {
    expect(compactMoney(412e9)).toBe("$412.0B");
    expect(compactMoney(2.5e12)).toBe("$2.5T");
    expect(compactMoney(null)).toBe("n/a");
    expect(pct(0.1234, true)).toBe("+12.3%");
    expect(pct(-0.05, true)).toBe("-5.0%");
    expect(pct(Infinity)).toBe("n/a");
  });

  it("describes headline age", () => {
    const now = Date.parse("2026-10-27T12:00:00Z");
    expect(ago("2026-10-27T11:15:00Z", now)).toBe("45m ago");
    expect(ago("2026-10-27T02:00:00Z", now)).toBe("10h ago");
    expect(ago("2026-10-20T12:00:00Z", now)).toBe("7d ago");
  });

  it("picks the compact unit after rounding and puts the sign before the $", () => {
    expect(compactMoney(999_960_000)).toBe("$1.0B");
    expect(compactMoney(999_960)).toBe("$1.0M");
    expect(compactMoney(-5e6)).toBe("-$5.0M");
    expect(money(-3, null)).toBe("-$3.00");
    expect(usd(Number.NaN)).toBe("n/a");
  });

  it("never shows a signed zero, and colours what is displayed", () => {
    expect(pct(0.0004, true)).toBe("0.0%");
    expect(pct(-0.0004, true)).toBe("0.0%");
    expect(toneOf(0.0004)).toBeUndefined();
    expect(toneOf(0.0006)).toBe("pos");
    expect(toneOf(-0.02)).toBe("neg");
    expect(toneOf(null)).toBeUndefined();
  });
});
