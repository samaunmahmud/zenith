import type {
  AgentModel,
  AnalystName,
  AnalystReport,
  ChairDecision,
  CommitteeEvent,
  CommitteeResult,
  NewsDigest,
  NewsItem,
  Rebuttal,
  Snapshot,
  SourceInfo,
  Stage,
} from "../types";
import { ANALYSTS } from "../lib/format";

/** Start/end times per agent id (plus "run"), as seen by this browser: drives the committee floor's clocks. */
export type Timing = Partial<Record<string, { start?: number; end?: number }>>;

export interface CommitteeState {
  status: "idle" | "running" | "done" | "error";
  ticker: string;
  rebuttals: boolean;
  stage: Stage | null;
  snapshot: Snapshot | null;
  sources: SourceInfo[];
  news: NewsItem[];
  agents: AgentModel[];
  /** undefined = the news desk hasn't reported yet; null = it ran but produced nothing. */
  digest: NewsDigest | null | undefined;
  reports: Partial<Record<AnalystName, AnalystReport>>;
  errors: Partial<Record<AnalystName, string>>;
  debate: Rebuttal[];
  decision: ChairDecision | null;
  result: CommitteeResult | null;
  error: string | null;
  /** HTTP-style status of a failure: 503 = AI switched off, 429 = committee busy, 0 = connection lost. */
  errorStatus: number | null;
  timing: Timing;
}

export const initialState: CommitteeState = {
  status: "idle",
  ticker: "",
  rebuttals: false,
  stage: null,
  snapshot: null,
  sources: [],
  news: [],
  agents: [],
  digest: undefined,
  reports: {},
  errors: {},
  debate: [],
  decision: null,
  result: null,
  error: null,
  errorStatus: null,
  timing: {},
};

export type CommitteeAction =
  | { type: "start"; ticker: string; rebuttals: boolean; at: number }
  | { type: "reset" }
  | { type: "event"; event: CommitteeEvent; at: number };

/** Which agents begin work when a stage starts. */
const STAGE_AGENTS: Partial<Record<Stage, string[]>> = {
  data: ["clerk"],
  // Technicals works from prices alone, so the backend starts it alongside the news desk.
  news: ["news", "technicals"],
  analysts: ANALYSTS,
  rebuttals: ANALYSTS.map((a) => `${a}-rebuttal`),
  chair: ["chair"],
};

/** Sets start/end for the given ids, never overwriting a time already recorded. */
function mark(timing: Timing, ids: string[], key: "start" | "end", at: number): Timing {
  const next = { ...timing };
  for (const id of ids) if (next[id]?.[key] === undefined) next[id] = { ...next[id], [key]: at };
  return next;
}

export function committeeReducer(state: CommitteeState, action: CommitteeAction): CommitteeState {
  if (action.type === "start") {
    return { ...initialState, status: "running", ticker: action.ticker, rebuttals: action.rebuttals, timing: { run: { start: action.at } } };
  }
  if (action.type === "reset") return initialState;
  // Late events from a stream that has already finished (or been replaced) must not reopen a run.
  if (state.status !== "running") return state;

  const { event: e, at } = action;
  switch (e.type) {
    case "stage":
      return { ...state, stage: e.stage, timing: mark(state.timing, STAGE_AGENTS[e.stage] ?? [], "start", at) };
    case "snapshot":
      return { ...state, snapshot: e.snapshot, sources: e.sources, news: e.news, agents: e.agents, timing: mark(state.timing, ["clerk"], "end", at) };
    case "news":
      return { ...state, digest: e.digest, timing: mark(state.timing, ["news"], "end", at) };
    case "report":
      return { ...state, reports: { ...state.reports, [e.report.analyst]: e.report }, timing: mark(state.timing, [e.report.analyst], "end", at) };
    case "analystError":
      return { ...state, errors: { ...state.errors, [e.analyst]: e.message }, timing: mark(state.timing, [e.analyst], "end", at) };
    case "rebuttal":
      return { ...state, debate: [...state.debate, e.rebuttal], timing: mark(state.timing, [`${e.rebuttal.analyst}-rebuttal`], "end", at) };
    case "decision":
      return { ...state, decision: e.decision, timing: mark(state.timing, ["chair"], "end", at) };
    case "done": {
      // The final result is the source of truth: it also covers replays, which send no progress events.
      const r = e.result;
      return {
        ...state,
        status: "done",
        stage: null,
        snapshot: r.snapshot,
        sources: r.sources,
        news: r.news,
        agents: r.agents,
        digest: r.newsDigest,
        reports: Object.fromEntries(r.reports.map((x) => [x.analyst, x])),
        errors: Object.fromEntries(r.analystErrors.map((x) => [x.analyst, x.message])),
        debate: r.rebuttals,
        decision: r.decision,
        result: r,
        timing: mark(state.timing, ["run"], "end", at),
      };
    }
    case "error":
      return { ...state, status: "error", stage: null, error: e.message, errorStatus: e.status, timing: mark(state.timing, ["run"], "end", at) };
  }
}

/** Reports in the fixed analyst order. */
export const reportList = (s: CommitteeState) => ANALYSTS.map((a) => s.reports[a]).filter((r): r is AnalystReport => Boolean(r));
