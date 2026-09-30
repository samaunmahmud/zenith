import { describe, expect, it } from "vitest";
import type { CallCost, CommitteeResult } from "../types";
import { committeeReducer, initialState } from "../state/committee";
import { CLERK_MS, liveTape, progressAt, replayTape, statusAt, totalsAt } from "./tape";

const call = (agent: string, tier: CallCost["tier"], latencyMs: number, out = 100, cost = 0.001, extra: Partial<CallCost> = {}): CallCost => ({
  agent, model: `nvidia/${tier}`, tier, promptTokens: 50, completionTokens: out, latencyMs, estimatedCostUsd: cost, attempt: 1, ok: true, ...extra,
});

const result = (calls: CallCost[]): CommitteeResult => ({ costs: { calls }, agents: [] } as unknown as CommitteeResult);

describe("replayTape", () => {
  // Latencies from the saved TSLA session.
  const tape = replayTape(result([
    call("news", "nano", 13844),
    call("risk", "super", 6102),
    call("fundamentals", "super", 7222),
    call("technicals", "nano", 20588),
    call("fundamentals-rebuttal", "super", 4910),
    call("technicals-rebuttal", "nano", 7489),
    call("risk-rebuttal", "super", 10194),
    call("chair", "ultra", 5312),
  ]));
  const at = (id: string) => tape.procs.find((p) => p.id === id)!;

  it("runs stages one after another and analysts in parallel", () => {
    expect(at("clerk")).toMatchObject({ start: 0, end: CLERK_MS, tier: null });
    expect(at("news")).toMatchObject({ start: CLERK_MS, end: CLERK_MS + 13844 });
    const round = CLERK_MS + 13844;
    for (const a of ["fundamentals", "technicals", "risk"]) expect(at(a).start).toBe(round);
    // The rebuttal round waits for the slowest analyst (technicals on Nano).
    expect(at("risk-rebuttal").start).toBe(round + 20588);
    expect(at("chair").start).toBe(round + 20588 + 10194);
    expect(tape.total).toBe(round + 20588 + 10194 + 5312);
  });

  it("keeps analysts in a fixed order whatever order the calls finished in", () => {
    expect(tape.procs.filter((p) => p.phase === "analysts").map((p) => p.id)).toEqual(["fundamentals", "technicals", "risk"]);
    expect(at("risk-rebuttal")).toMatchObject({ seat: "risk", task: "rebuttal", label: "Risk" });
  });

  it("folds a retry into one process: latencies and tokens add up, the last attempt decides ok", () => {
    const t = replayTape(result([call("fundamentals", "super", 1000, 10), call("fundamentals", "super", 2000, 20, 0.001, { attempt: 2 })]));
    expect(t.procs[1]).toMatchObject({ id: "fundamentals", end: CLERK_MS + 3000, tokensOut: 30, attempts: 2, ok: true });
  });

  it("counts cost and tokens only for processes that have finished", () => {
    expect(totalsAt(tape, CLERK_MS + 100)).toMatchObject({ cost: 0, calls: 0 });
    const afterNews = totalsAt(tape, CLERK_MS + 13844);
    expect(afterNews).toMatchObject({ calls: 1, tokens: 150 });
    expect(afterNews.byTier.nano).toBeCloseTo(0.001);
    expect(totalsAt(tape, tape.total!).calls).toBe(8);
  });
});

describe("statusAt / progressAt", () => {
  const p = replayTape(result([call("news", "nano", 1000)])).procs[1];
  it("moves from queued to running to done", () => {
    expect(statusAt(p, 0)).toBe("queued");
    expect(statusAt(p, CLERK_MS + 500)).toBe("running");
    expect(progressAt(p, CLERK_MS + 500)).toBeCloseTo(0.5);
    expect(statusAt(p, CLERK_MS + 1000)).toBe("done");
    expect(progressAt(p, 99999)).toBe(1);
  });
  it("marks a process whose last attempt failed", () => {
    const f = replayTape(result([call("chair", "ultra", 10, 1, 0, { ok: false })])).procs[1];
    expect(statusAt(f, 99999)).toBe("failed");
  });
});

describe("liveTape", () => {
  it("times each seat from the events this browser received", () => {
    let s = committeeReducer(initialState, { type: "start", ticker: "AAPL", rebuttals: true, at: 1000 });
    s = committeeReducer(s, { type: "event", at: 1100, event: { type: "stage", stage: "data", message: "" } });
    s = committeeReducer(s, { type: "event", at: 1900, event: { type: "snapshot", snapshot: {} as never, sources: [], news: [], agents: [] } });
    s = committeeReducer(s, { type: "event", at: 2000, event: { type: "stage", stage: "news", message: "" } });
    const tape = liveTape(s);
    expect(tape.total).toBeNull();
    const clerk = tape.procs.find((p) => p.id === "clerk")!;
    expect(clerk).toMatchObject({ start: 100, end: 900, tokensOut: 0 });
    expect(tape.procs.find((p) => p.id === "news")).toMatchObject({ start: 1000, end: null, tokensOut: null });
    // With rebuttals on, the three rebuttal seats are listed (queued) from the start.
    expect(tape.procs.filter((p) => p.phase === "rebuttals")).toHaveLength(3);
    expect(statusAt(tape.procs.find((p) => p.id === "chair")!, 5000)).toBe("queued");
  });
});

describe("replayTape with recorded start times", () => {
  const t = replayTape(result([
    call("news", "nano", 3000, 100, 0.001, { startMs: 800 }),
    call("technicals", "nano", 4000, 100, 0.001, { startMs: 810 }),
    call("fundamentals", "super", 6000, 100, 0.001, { startMs: 3900 }),
    call("fundamentals", "super", 2000, 100, 0.001, { startMs: 9950, attempt: 2 }),
    call("risk", "super", 5000, 100, 0.001, { startMs: 3905 }),
    call("chair", "ultra", 7000, 100, 0.001, { startMs: 12000 }),
  ]));
  const at = (id: string) => t.procs.find((p) => p.id === id)!;

  it("draws each process where it actually ran, overlaps included", () => {
    expect(at("clerk")).toMatchObject({ start: 0, end: 800 });
    expect(at("technicals")).toMatchObject({ start: 810, end: 4810 }); // alongside the news desk
    expect(at("fundamentals")).toMatchObject({ start: 3900, end: 11950, attempts: 2 }); // a retry extends it
    expect(t.total).toBe(19000);
    expect(t.procs.map((p) => p.id)).toEqual(["clerk", "news", "fundamentals", "technicals", "risk", "chair"]);
  });

  it("falls back to stage order when any call lacks a start time", () => {
    const old = replayTape(result([call("news", "nano", 3000, 100, 0.001, { startMs: 800 }), call("chair", "ultra", 1000)]));
    expect(old.procs.find((p) => p.id === "news")!.start).toBe(CLERK_MS);
  });
});
