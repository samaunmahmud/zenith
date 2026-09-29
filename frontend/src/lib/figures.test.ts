import { describe, expect, it } from "vitest";
import { segmentFigures } from "./figures";

describe("segmentFigures", () => {
  const figs = (text: string, flagged: string[] = [], checked = true) =>
    segmentFigures(text, flagged, checked).filter((s) => s.figure).map((s) => `${s.figure}:${s.text}`);

  it("marks data-like figures as traced once checked", () => {
    expect(figs("P/E of 38.93 and margin of 33.2% at $341.07")).toEqual(["traced:38.93", "traced:33.2%", "traced:$341.07"]);
  });

  it("marks a figure the backend flagged, matching its bare number", () => {
    expect(figs("volatility of 11.2% vs 24.6%", ["11.2"])).toEqual(["flagged:11.2%", "traced:24.6%"]);
  });

  it("leaves indicator names, periods, years and small counts as text", () => {
    expect(figs("SMA200 and RSI14 over the 52-week range in 2026, 3 analysts, 200 days")).toEqual([]);
  });

  it("marks nothing as traced before the check has run, but still shows flags", () => {
    expect(figs("38.93 and 11.2", ["11.2"], false)).toEqual(["flagged:11.2"]);
  });

  it("keeps the text intact", () => {
    const text = "Down -13.8% from a $1,234.50 peak.";
    expect(segmentFigures(text, [], true).map((s) => s.text).join("")).toBe(text);
  });
});
