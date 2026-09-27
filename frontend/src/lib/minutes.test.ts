import { describe, expect, it } from "vitest";
import { initialState, type CommitteeState } from "../state/committee";
import type { AnalystReport, ChairDecision, Snapshot } from "../types";
import { buildMinutes, latestSaid, seatStates, segmentFigures } from "./minutes";

const report = (analyst: AnalystReport["analyst"], stance: AnalystReport["stance"] = "neutral"): AnalystReport => ({
  analyst, stance, confidence: 0.6, headline: `${analyst} view`, keyPoints: ["a", "b"], evidence: [], concerns: [],
});
const decision: ChairDecision = {
  recommendation: "HOLD", confidence: 0.64, summary: "Hold.", rationale: ["x", "y", "z"], dissent: null, keyRisks: ["r1", "r2"], timeHorizon: "3-6 months",
};
const snapshot = { facts: { fundamentals: { a: "1", b: "2" }, technicals: { c: "3" }, risk: {} } } as unknown as Snapshot;

const state = (patch: Partial<CommitteeState>): CommitteeState => ({ ...initialState, status: "done", ticker: "AAPL", ...patch });

describe("buildMinutes", () => {
  it("minutes a full session in speaking order: clerk, news, analysts, rebuttals, chair", () => {
    const s = state({
      snapshot,
      digest: null,
      reports: { risk: report("risk"), fundamentals: report("fundamentals"), technicals: report("technicals") },
      debate: [{ analyst: "risk", respondingTo: "technicals", response: "No.", stanceChanged: false }],
      decision,
    });
    expect(buildMinutes(s).map((e) => e.id)).toEqual(["clerk", "news", "fundamentals", "technicals", "risk", "risk-rebuttal", "chair"]);
  });

  it("orders live opening statements by when they arrived", () => {
    const s = state({
      status: "running",
      reports: { fundamentals: report("fundamentals"), technicals: report("technicals") },
      timing: { fundamentals: { start: 0, end: 900 }, technicals: { start: 0, end: 300 } },
    });
    expect(buildMinutes(s).map((e) => e.id)).toEqual(["technicals", "fundamentals"]);
  });

  it("counts each analyst's fact sheet for the clerk", () => {
    const [clerk] = buildMinutes(state({ snapshot }));
    expect(clerk).toMatchObject({ kind: "clerk", figures: { fundamentals: 2, technicals: 1, risk: 0 } });
  });

  it("records an analyst that failed in its place", () => {
    expect(buildMinutes(state({ errors: { risk: "bad json" } }))[0]).toMatchObject({ kind: "analystError", seat: "risk" });
  });
});

describe("seatStates", () => {
  const done = state({ snapshot, reports: { fundamentals: report("fundamentals", "bullish") }, decision });
  const entries = buildMinutes(done);

  it("has the next seat thinking and the others waiting while a replay is read out", () => {
    const seats = seatStates(done, entries, 1); // only the clerk has spoken
    expect(seats.clerk).toBe("speaking");
    expect(seats.fundamentals).toBe("thinking");
    expect(seats.chair).toBe("waiting");
  });

  it("gives the chair the floor once the ruling is read", () => {
    const seats = seatStates(done, entries, entries.length);
    expect(seats.chair).toBe("speaking");
    expect(seats.fundamentals).toBe("spoke");
  });

  it("shows agents the server has started as thinking during a live run", () => {
    const live = state({ status: "running", snapshot, stage: "analysts", timing: { risk: { start: 5 } } });
    const seats = seatStates(live, buildMinutes(live), 1);
    expect(seats.risk).toBe("thinking");
    expect(seats.technicals).toBe("waiting");
  });

  it("keeps an analyst's stance, not its rebuttal, as what it said", () => {
    const s = state({ reports: { risk: report("risk", "bearish") }, debate: [{ analyst: "risk", respondingTo: "fundamentals", response: "r", stanceChanged: false }] });
    expect(latestSaid(buildMinutes(s)).risk?.kind).toBe("report");
  });
});

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
