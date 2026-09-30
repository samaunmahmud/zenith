import type { AgentModel, AnalystName, CallCost, CommitteeResult, Tier } from "../types";
import type { CommitteeState } from "../state/committee";
import { ANALYSTS, ANALYST_TITLE } from "./format";

/**
 * The session tape: every process the committee ran, with when it started and finished on one clock.
 *
 * A live run is timed by this browser as events arrive. A saved run carries no progress events, only its
 * recorded calls. Newer sessions record when each call started, so the tape is drawn exactly as it ran
 * (technicals alongside the news desk, for example). Older ones only have latencies, so their tape is rebuilt
 * in stage order (data → news → analysts in parallel → rebuttals in parallel → chair), and the Clerk's time
 * (Java, not logged) is nominal. Every duration and token count on a replayed tape is a recorded one.
 */

export type Phase = "clerk" | "news" | "analysts" | "rebuttals" | "chair";

export interface Proc {
  /** Matches CallCost.agent: "news", "fundamentals", "risk-rebuttal", "chair"; plus "clerk" for the Java step. */
  id: string;
  phase: Phase;
  /** Who is speaking: an analyst, "news", "chair" or "clerk". */
  seat: string;
  label: string;
  task: string;
  /** null for the Clerk, which is Java and uses no model. */
  tier: Tier | null;
  model: string | null;
  /** ms from the start of the session on this tape's clock; null = not started (live) */
  start: number | null;
  end: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  cost: number | null;
  attempts: number;
  ok: boolean;
}

export interface Tape {
  procs: Proc[];
  /** When the last process finished, or null while a live run is still going. */
  total: number | null;
}

/** Nominal length of the Clerk's step on a replay (fetching and computing aren't logged per run). */
export const CLERK_MS = 900;

const SEAT_LABEL: Record<string, string> = { ...ANALYST_TITLE, news: "News desk", chair: "Chair", clerk: "Clerk" };

function describe(id: string): Pick<Proc, "phase" | "seat" | "label" | "task"> {
  if (id === "clerk") return { phase: "clerk", seat: "clerk", label: "Clerk", task: "compute indicators" };
  if (id === "news") return { phase: "news", seat: "news", label: "News desk", task: "digest headlines" };
  if (id === "chair") return { phase: "chair", seat: "chair", label: "Chair", task: "rule & record dissent" };
  if (id.endsWith("-rebuttal")) {
    const seat = id.replace(/-rebuttal$/, "");
    return { phase: "rebuttals", seat, label: SEAT_LABEL[seat] ?? seat, task: "rebuttal" };
  }
  return { phase: "analysts", seat: id, label: SEAT_LABEL[id] ?? id, task: "opening position" };
}

function tierOf(id: string, agents: AgentModel[]): { tier: Tier | null; model: string | null } {
  if (id === "clerk") return { tier: null, model: null };
  const seat = describe(id).seat;
  const a = agents.find((x) => x.id === seat);
  return { tier: a?.tier ?? null, model: a?.model ?? null };
}

/** All calls one agent made (a retry is a second call), folded into one process. */
function fold(calls: CallCost[]) {
  return {
    latency: calls.reduce((s, c) => s + c.latencyMs, 0),
    tokensIn: calls.reduce((s, c) => s + c.promptTokens, 0),
    tokensOut: calls.reduce((s, c) => s + c.completionTokens, 0),
    cost: calls.reduce((s, c) => s + c.estimatedCostUsd, 0),
    attempts: calls.length,
    ok: calls[calls.length - 1]?.ok ?? false,
    tier: calls[0]?.tier ?? null,
    model: calls[0]?.model ?? null,
  };
}

const PHASES: Phase[] = ["clerk", "news", "analysts", "rebuttals", "chair"];

/** Rebuilds a saved session's timeline from its recorded calls. */
export function replayTape(result: CommitteeResult): Tape {
  const byAgent = new Map<string, CallCost[]>();
  for (const c of result.costs.calls) byAgent.set(c.agent, [...(byAgent.get(c.agent) ?? []), c]);
  const calls = result.costs.calls;
  if (calls.length > 0 && calls.every((c) => typeof c.startMs === "number")) return timedTape(byAgent, result);

  const procs: Proc[] = [{ id: "clerk", ...describe("clerk"), tier: null, model: null, start: 0, end: CLERK_MS, tokensIn: 0, tokensOut: 0, cost: 0, attempts: 1, ok: true }];
  let cursor = CLERK_MS;
  for (const phase of PHASES.slice(1)) {
    const ids = [...byAgent.keys()].filter((id) => describe(id).phase === phase);
    if (ids.length === 0) continue;
    let phaseEnd = cursor;
    for (const id of order(ids)) {
      const f = fold(byAgent.get(id)!);
      const known = tierOf(id, result.agents);
      procs.push({
        id, ...describe(id),
        tier: f.tier ?? known.tier, model: f.model ?? known.model,
        start: cursor, end: cursor + f.latency,
        tokensIn: f.tokensIn, tokensOut: f.tokensOut, cost: f.cost, attempts: f.attempts, ok: f.ok,
      });
      phaseEnd = Math.max(phaseEnd, cursor + f.latency);
    }
    cursor = phaseEnd;
  }
  return { procs, total: cursor };
}

/** A session that recorded each call's start: every process sits exactly where it ran. The Clerk runs until the first call. */
function timedTape(byAgent: Map<string, CallCost[]>, result: CommitteeResult): Tape {
  const first = Math.min(...result.costs.calls.map((c) => c.startMs!));
  const procs: Proc[] = [{ id: "clerk", ...describe("clerk"), tier: null, model: null, start: 0, end: first, tokensIn: 0, tokensOut: 0, cost: 0, attempts: 1, ok: true }];
  const ids = order([...byAgent.keys()]).sort((a, b) => PHASES.indexOf(describe(a).phase) - PHASES.indexOf(describe(b).phase));
  let total = first;
  for (const id of ids) {
    const cs = byAgent.get(id)!;
    const f = fold(cs);
    const known = tierOf(id, result.agents);
    const start = Math.min(...cs.map((c) => c.startMs!));
    const end = Math.max(...cs.map((c) => c.startMs! + c.latencyMs));
    procs.push({
      id, ...describe(id),
      tier: f.tier ?? known.tier, model: f.model ?? known.model,
      start, end,
      tokensIn: f.tokensIn, tokensOut: f.tokensOut, cost: f.cost, attempts: f.attempts, ok: f.ok,
    });
    total = Math.max(total, end);
  }
  return { procs, total };
}

/** Analysts in their fixed order (fundamentals, technicals, risk), anything else after. */
function order(ids: string[]): string[] {
  const rank = (id: string) => {
    const i = ANALYSTS.indexOf(describe(id).seat as AnalystName);
    return i < 0 ? 99 : i;
  };
  return [...ids].sort((a, b) => rank(a) - rank(b));
}

/**
 * A live session's timeline, as this browser saw it. Token counts and cost arrive with the final result,
 * so they're filled in only once the run is over.
 */
export function liveTape(s: CommitteeState): Tape {
  const t0 = s.timing.run?.start;
  if (t0 === undefined) return { procs: [], total: null };
  const rel = (x: number | undefined) => (x === undefined ? null : x - t0);
  const calls = new Map<string, CallCost[]>();
  for (const c of s.result?.costs.calls ?? []) calls.set(c.agent, [...(calls.get(c.agent) ?? []), c]);

  const ids = ["clerk", "news", ...ANALYSTS, ...(s.rebuttals ? ANALYSTS.map((a) => `${a}-rebuttal`) : []), "chair"];
  const procs: Proc[] = ids.map((id) => {
    const f = calls.has(id) ? fold(calls.get(id)!) : null;
    const known = tierOf(id, s.agents);
    const failed = describe(id).phase === "analysts" && Boolean(s.errors[id as AnalystName]);
    return {
      id, ...describe(id),
      tier: f?.tier ?? known.tier, model: f?.model ?? known.model,
      start: rel(s.timing[id]?.start), end: rel(s.timing[id]?.end),
      tokensIn: id === "clerk" ? 0 : f?.tokensIn ?? null,
      tokensOut: id === "clerk" ? 0 : f?.tokensOut ?? null,
      cost: id === "clerk" ? 0 : f?.cost ?? null,
      attempts: f?.attempts ?? 1,
      ok: !failed && (f?.ok ?? true),
    };
  });
  // A finished run has nothing left to wait for: drop seats that never sat (e.g. no rebuttals were possible).
  const kept = s.status === "running" ? procs : procs.filter((p) => p.start !== null);
  const end = rel(s.timing.run?.end);
  return { procs: kept, total: s.status === "running" ? null : end };
}

export type ProcStatus = "queued" | "running" | "done" | "failed";

export function statusAt(p: Proc, t: number): ProcStatus {
  if (p.start === null || t < p.start) return "queued";
  if (p.end === null || t < p.end) return "running";
  return p.ok ? "done" : "failed";
}

/** How far through a process the clock is, 0..1 (1 once it's done). */
export function progressAt(p: Proc, t: number): number {
  if (p.start === null || t < p.start) return 0;
  if (p.end === null) return 0;
  if (t >= p.end) return 1;
  return (t - p.start) / Math.max(1, p.end - p.start);
}

/** Totals of every process finished by time t (a replay's meters count up as calls complete). */
export function totalsAt(tape: Tape, t: number) {
  let tokens = 0;
  let cost = 0;
  let calls = 0;
  const byTier: Record<Tier, number> = { nano: 0, super: 0, ultra: 0 };
  for (const p of tape.procs) {
    if (p.tier === null || statusAt(p, t) === "queued" || statusAt(p, t) === "running") continue;
    tokens += (p.tokensIn ?? 0) + (p.tokensOut ?? 0);
    cost += p.cost ?? 0;
    calls += p.attempts;
    byTier[p.tier] += p.cost ?? 0;
  }
  return { tokens, cost, calls, byTier };
}

/** A process's finish time, or null if it hasn't finished (or doesn't exist). */
export function doneAt(tape: Tape, id: string): number | null {
  const p = tape.procs.find((x) => x.id === id);
  return p?.end ?? null;
}
