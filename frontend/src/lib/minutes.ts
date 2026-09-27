import type { AnalystName, AnalystReport, ChairDecision, NewsDigest, Rebuttal } from "../types";
import type { CommitteeState } from "../state/committee";
import { ANALYSTS } from "./format";

/**
 * The boardroom's minutes: everything said in a session, in the order it was said.
 * Built from the committee state, so the same list drives the live stream and a replayed decision.
 */
export type Seat = "clerk" | "news" | AnalystName | "chair";

export type Entry =
  | { kind: "clerk"; id: "clerk"; seat: "clerk"; figures: Record<AnalystName, number> }
  | { kind: "news"; id: "news"; seat: "news"; digest: NewsDigest | null }
  | { kind: "report"; id: AnalystName; seat: AnalystName; report: AnalystReport }
  | { kind: "analystError"; id: string; seat: AnalystName; message: string }
  | { kind: "rebuttal"; id: string; seat: AnalystName; rebuttal: Rebuttal }
  | { kind: "ruling"; id: "chair"; seat: "chair"; decision: ChairDecision }
  | { kind: "chairError"; id: "chair-error"; seat: "chair"; message: string };

/** When an analyst's statement arrived in this browser, so opening statements are minuted in the order they landed. */
const arrival = (s: CommitteeState, a: AnalystName) => s.timing[a]?.end ?? Number.POSITIVE_INFINITY;

export function buildMinutes(s: CommitteeState): Entry[] {
  const out: Entry[] = [];
  if (s.snapshot) {
    const f = s.snapshot.facts;
    out.push({ kind: "clerk", id: "clerk", seat: "clerk", figures: { fundamentals: count(f.fundamentals), technicals: count(f.technicals), risk: count(f.risk) } });
  }
  if (s.digest !== undefined) out.push({ kind: "news", id: "news", seat: "news", digest: s.digest });

  // Stable sort: a replay has no arrival times, so it keeps the fixed analyst order.
  const spoke = ANALYSTS.filter((a) => s.reports[a] || s.errors[a]).sort((a, b) => arrival(s, a) - arrival(s, b));
  for (const a of spoke) {
    const report = s.reports[a];
    if (report) out.push({ kind: "report", id: a, seat: a, report });
    else out.push({ kind: "analystError", id: `${a}-error`, seat: a, message: s.errors[a] ?? "" });
  }

  s.debate.forEach((r) => out.push({ kind: "rebuttal", id: `${r.analyst}-rebuttal`, seat: r.analyst, rebuttal: r }));

  if (s.decision) out.push({ kind: "ruling", id: "chair", seat: "chair", decision: s.decision });
  else if (s.result?.chairError) out.push({ kind: "chairError", id: "chair-error", seat: "chair", message: s.result.chairError });
  return out;
}

const count = (facts: Record<string, string> | undefined) => Object.keys(facts ?? {}).length;

/** Which integrity-check agent id a piece of text belongs to (matches CommitteeService's flags). */
export function integrityAgent(e: Entry): string | null {
  if (e.kind === "report") return e.report.analyst;
  if (e.kind === "rebuttal") return `${e.rebuttal.analyst}-rebuttal`;
  if (e.kind === "ruling") return "chair";
  return null;
}

export type Segment = { text: string; figure?: "flagged" | "traced" };

// A figure as written in prose: optional sign and $, digits with thousands separators, decimals, then %, x or a unit.
// Not inside a word, so "SMA200" and "RSI14" stay text.
const FIGURE = /(?<![A-Za-z\d.])[-+−]?\$?\d{1,3}(?:,\d{3})+(?:\.\d+)?[%xBMKT]?|(?<![A-Za-z\d.])[-+−]?\$?\d+(?:\.\d+)?[%xBMKT]?(?![A-Za-z\d])/g;

// "52-week", "200 days": periods, not data, and skipped by the backend check too. Same for years (2026).
const PERIOD = /^[-‑\s]?(?:day|week|month|year|quarter|session)s?\b/i;

/** The bare number the backend reports for a figure: no sign, $, % or unit ("-$1,234.5%" → "1,234.5"). */
export const bare = (figure: string) => figure.replace(/^[-+−]/, "").replace(/^\$/, "").replace(/[%xBMKT]$/, "");

/**
 * Splits text into plain runs and figures. A figure the integrity check couldn't trace to the agent's input is
 * "flagged". Once the check has run (`checked`), a figure that looks like data (has a decimal, %, $ or thousands
 * separator) and wasn't flagged is "traced"; bare small integers ("3 analysts") are left as text, as the backend
 * doesn't check them either.
 */
export function segmentFigures(text: string, flagged: string[], checked: boolean): Segment[] {
  const flags = new Set(flagged.map(bare));
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(FIGURE)) {
    const raw = m[0];
    const start = m.index ?? 0;
    const core = bare(raw);
    const isFlagged = flags.has(core) || flags.has(`-${core}`);
    const dataLike = /[.,%$]/.test(raw) || (Number(core) > 10 && !/^(19|20)\d\d$/.test(core) && !PERIOD.test(text.slice(start + raw.length)));
    if (!isFlagged && !(checked && dataLike)) continue;
    if (start > last) out.push({ text: text.slice(last, start) });
    out.push({ text: raw, figure: isFlagged ? "flagged" : "traced" });
    last = start + raw.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export type SeatState = "idle" | "waiting" | "thinking" | "speaking" | "spoke" | "failed";
export const SEATS: Seat[] = ["clerk", "news", "fundamentals", "technicals", "risk", "chair"];

/**
 * What each seat is doing, given the first `shown` minutes are on screen.
 * The seat whose statement is read next is "thinking" (it's about to speak); during a live run, any agent the
 * server has started but that hasn't reported is thinking too. The last seat read out has the floor.
 */
export function seatStates(s: CommitteeState, entries: Entry[], shown: number): Record<Seat, SeatState> {
  const live = s.status === "running";
  const inSession = live || shown < entries.length;
  const out = Object.fromEntries(SEATS.map((k) => [k, inSession ? "waiting" : "idle"])) as Record<Seat, SeatState>;
  const onScreen = entries.slice(0, shown);

  if (live) {
    if (!s.snapshot) out.clerk = "thinking";
    for (const seat of ["news", ...ANALYSTS, "chair"] as Seat[]) {
      const started = s.timing[seat]?.start !== undefined && s.timing[seat]?.end === undefined;
      if (started) out[seat] = "thinking";
    }
    if (s.stage === "rebuttals") {
      for (const a of ANALYSTS) if (s.reports[a] && !s.debate.some((r) => r.analyst === a)) out[a] = "thinking";
    }
  }
  for (const e of onScreen) out[e.seat] = e.kind === "analystError" || e.kind === "chairError" ? "failed" : "spoke";
  // Statements that have arrived but are still queued: the next one's seat is about to speak; the others wait
  // their turn, so the table never runs ahead of the minutes.
  for (let i = shown; i < entries.length; i++) {
    const seat = entries[i].seat;
    if (i === shown) out[seat] = "thinking";
    else if (out[seat] !== "spoke" && out[seat] !== "failed") out[seat] = "waiting";
  }
  const last = onScreen[onScreen.length - 1];
  if (last && out[last.seat] === "spoke" && inSession) out[last.seat] = "speaking";
  if (last?.kind === "ruling") out.chair = "speaking";
  return out;
}

/** The latest substantive statement per seat (opening report over rebuttal: it carries the stance). */
export function latestSaid(entries: Entry[]): Partial<Record<Seat, Entry>> {
  const out: Partial<Record<Seat, Entry>> = {};
  for (const e of entries) if (e.kind !== "rebuttal" || !out[e.seat]) out[e.seat] = e;
  return out;
}

/** One line per entry for the table centre: who has the floor and the gist. */
export function gist(e: Entry): string {
  switch (e.kind) {
    case "clerk": return "Every indicator computed in Java before any model is called.";
    case "news": return e.digest?.themes[0] ?? "No recent headlines.";
    case "report": return e.report.headline;
    case "analystError": return "Couldn't produce a valid report.";
    case "rebuttal": return e.rebuttal.response;
    case "ruling": return e.decision.summary;
    case "chairError": return "The chair couldn't reach a valid decision.";
  }
}
