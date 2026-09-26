import { describe, expect, it } from "vitest";
import type { AnalystReport, CommitteeEvent, CommitteeResult } from "../types";
import { committeeReducer, initialState, reportList, type CommitteeState } from "./committee";

const report = (analyst: AnalystReport["analyst"], stance: AnalystReport["stance"] = "bullish"): AnalystReport => ({
  analyst,
  stance,
  confidence: 0.7,
  headline: `${analyst} view`,
  keyPoints: [],
  evidence: [],
  concerns: [],
});

const start = (at = 0) => committeeReducer(initialState, { type: "start", ticker: "AAPL", rebuttals: true, at });
const apply = (state: CommitteeState, event: CommitteeEvent, at = 0) => committeeReducer(state, { type: "event", event, at });

describe("committeeReducer", () => {
  it("starts a clean run and remembers the options", () => {
    const s = start(5);
    expect(s.status).toBe("running");
    expect(s.ticker).toBe("AAPL");
    expect(s.rebuttals).toBe(true);
    expect(s.timing.run).toEqual({ start: 5 });
  });

  it("times each agent from its stage start to its own result", () => {
    let s = start();
    s = apply(s, { type: "stage", stage: "analysts", message: "" }, 100);
    s = apply(s, { type: "report", report: report("technicals") }, 900);
    s = apply(s, { type: "analystError", analyst: "risk", message: "invalid twice" }, 1500);
    expect(s.timing.technicals).toEqual({ start: 100, end: 900 });
    expect(s.timing.risk).toEqual({ start: 100, end: 1500 });
    expect(s.timing.fundamentals).toEqual({ start: 100 });
    expect(s.errors.risk).toBe("invalid twice");
  });

  it("never overwrites a time already recorded", () => {
    let s = start();
    s = apply(s, { type: "stage", stage: "news", message: "" }, 10);
    s = apply(s, { type: "stage", stage: "news", message: "" }, 99);
    expect(s.timing.news?.start).toBe(10);
  });

  it("takes the final result as the source of truth, including replays with no progress events", () => {
    const result = {
      ticker: "AAPL",
      generatedAt: "2026-10-01T10:00:00Z",
      snapshot: null,
      sources: [],
      news: [],
      newsDigest: null,
      reports: [report("risk", "bearish"), report("fundamentals")],
      analystErrors: [{ analyst: "technicals", message: "failed" }],
      rebuttals: [],
      decision: null,
      chairError: "no decision",
      memoMarkdown: "",
      costs: { calls: [], totalUsd: 0, totalPromptTokens: 0, totalCompletionTokens: 0, byTier: {} },
      integrity: [],
      agents: [],
      replayed: true,
      replayReason: "recent",
    } as unknown as CommitteeResult;
    const s = apply(start(), { type: "done", result }, 50);
    expect(s.status).toBe("done");
    expect(s.digest).toBeNull();
    expect(reportList(s).map((r) => r.analyst)).toEqual(["fundamentals", "risk"]); // fixed analyst order
    expect(s.errors.technicals).toBe("failed");
    expect(s.timing.run?.end).toBe(50);
  });

  it("records why a run stopped", () => {
    const s = apply(start(), { type: "error", message: "AI is off", status: 503 });
    expect(s.status).toBe("error");
    expect(s.errorStatus).toBe(503);
  });

  it("ignores late events once a run is over or was abandoned", () => {
    const done = apply(start(), { type: "error", message: "gone", status: 0 });
    expect(apply(done, { type: "report", report: report("risk") })).toBe(done);
    const home = committeeReducer(done, { type: "reset" });
    expect(apply(home, { type: "stage", stage: "chair", message: "" })).toBe(home);
  });
});
