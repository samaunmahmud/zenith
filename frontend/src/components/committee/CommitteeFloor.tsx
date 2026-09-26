import type { AgentModel, AnalystName, AnalystReport, ChairDecision, CostSummary, NewsDigest, Stage } from "../../types";
import type { Timing } from "../../state/committee";
import { ANALYSTS, secs } from "../../lib/format";
import { TierBadge } from "../ui/Badges";

export interface FloorProps {
  agents: AgentModel[];
  /** "preview" = the idle landing illustration: no run, just who sits where. */
  mode: "preview" | "running" | "done" | "error";
  stage: Stage | null;
  timing: Timing;
  now: number;
  digest: NewsDigest | null | undefined;
  reports: Partial<Record<AnalystName, AnalystReport>>;
  errors: Partial<Record<AnalystName, string>>;
  decision: ChairDecision | null;
  chairError: string | null;
  costs: CostSummary | null;
  /** A saved decision served again: this browser's clock timed the replay, not the meeting, so it's hidden. */
  replayed?: boolean;
}

type SeatState = "ready" | "waiting" | "thinking" | "done" | "failed" | "skipped";

interface SeatView {
  state: SeatState;
  status: string;
  tone?: string; // CSS class for the status colour
  meta?: string; // "7.4s · 3,380 tok"
}

/** After a run, the real model latency and tokens for an agent (its retries and rebuttal included). */
function measured(costs: CostSummary | null, id: string): string | undefined {
  if (!costs) return undefined;
  const calls = costs.calls.filter((c) => c.agent === id || c.agent.startsWith(`${id}-`));
  if (calls.length === 0) return undefined;
  const ms = calls.reduce((a, c) => a + c.latencyMs, 0);
  const tokens = calls.reduce((a, c) => a + c.promptTokens + c.completionTokens, 0);
  return `${secs(ms)} · ${tokens.toLocaleString()} tok`;
}

function clock(timing: Timing, id: string, now: number): string | undefined {
  const t = timing[id];
  if (t?.start === undefined) return undefined;
  return secs(Math.max(0, (t.end ?? now) - t.start));
}

function seatFor(id: string, p: FloorProps): SeatView {
  if (p.mode === "preview") return { state: "ready", status: "Ready" };
  const running = p.mode === "running";
  const started = p.timing[id]?.start !== undefined;
  const halted = p.mode === "error";
  const meta = () => measured(p.costs, id) ?? clock(p.timing, id, p.now);

  if (id === "news") {
    if (p.digest !== undefined) {
      const s = p.digest?.sentiment ?? "none";
      return { state: "done", status: s === "none" ? "No headlines" : `${s} news`, tone: `sent-${s}`, meta: meta() };
    }
    if (started && running) return { state: "thinking", status: "Reading headlines", meta: meta() };
    if (started && halted) return { state: "failed", status: "Interrupted", meta: meta() };
    return halted ? { state: "skipped", status: "Not run" } : { state: "waiting", status: "Waiting for data" };
  }

  if (id === "chair") {
    if (p.decision) return { state: "done", status: p.decision.recommendation, tone: `call-${p.decision.recommendation}`, meta: meta() };
    if (p.chairError) return { state: "failed", status: "No valid decision" };
    if (started && running) return { state: "thinking", status: "Deliberating", meta: meta() };
    if (started && halted) return { state: "failed", status: "Interrupted", meta: meta() };
    return halted ? { state: "skipped", status: "Not run" } : { state: "waiting", status: "Waiting for reports" };
  }

  const a = id as AnalystName;
  const report = p.reports[a];
  if (report) {
    const rebutting = running && p.stage === "rebuttals";
    return {
      state: rebutting ? "thinking" : "done",
      status: rebutting ? "Writing rebuttal" : `${report.stance} · ${Math.round(report.confidence * 100)}%`,
      tone: rebutting ? undefined : `stance-${report.stance}`,
      meta: meta(),
    };
  }
  // The backend fails fast before any analyst starts, so an analyst error always means that analyst really failed.
  if (p.errors[a]) return { state: "failed", status: "No valid report" };
  if (started && running) return { state: "thinking", status: "Analysing", meta: meta() };
  if (started && halted) return { state: "failed", status: "Interrupted", meta: meta() };
  return halted ? { state: "skipped", status: "Not run" } : { state: "waiting", status: "Waiting" };
}

function Seat({ agent, view }: { agent: AgentModel; view: SeatView }) {
  return (
    <div className={`seat seat-${view.state} seat-tier-${agent.tier}`} aria-label={`${agent.label}: ${view.status}`}>
      <div className="seat-top">
        <b>{agent.label}</b>
        <TierBadge tier={agent.tier} />
      </div>
      <div className={`seat-status ${view.tone ?? ""}`}>
        <i className="dot" aria-hidden="true" />
        <span>{view.status}</span>
        {view.meta && <span className="seat-meta num">{view.meta}</span>}
      </div>
    </div>
  );
}

const STAGE_TEXT: Record<Stage, string> = {
  data: "Fetching prices, fundamentals and news, then computing every indicator in Java",
  news: "The news desk is condensing the headlines on Nemotron Nano",
  analysts: "Three analysts are working in parallel, each on its own fact sheet",
  rebuttals: "Each analyst gets one short reply to the colleague it disagrees with",
  chair: "The chair is weighing the arguments on Nemotron Ultra",
  memo: "Assembling the memo in code",
};

/**
 * The committee as a live diagram: news desk → three analysts in parallel → chair.
 * Each seat shows its Nemotron tier, what it is doing now, and (after the run) its measured latency and tokens.
 */
export function CommitteeFloor(p: FloorProps) {
  const byId = (id: string) => p.agents.find((a) => a.id === id);
  const flowing = (stages: Stage[]) => p.mode === "running" && p.stage !== null && stages.includes(p.stage);
  const seat = (id: string) => {
    const agent = byId(id);
    return agent ? <Seat key={id} agent={agent} view={seatFor(id, p)} /> : null;
  };

  const run = p.timing.run;
  const total = run?.start !== undefined && !p.replayed ? Math.max(0, (run.end ?? p.now) - run.start) : 0;
  let caption: string;
  if (p.mode === "preview") caption = "Five seats, three model sizes";
  else if (p.mode === "running") caption = p.stage ? STAGE_TEXT[p.stage] : "Convening the committee";
  else if (p.mode === "error") caption = p.timing.news?.start === undefined ? "Adjourned before any model was called" : "Adjourned before the committee finished";
  else if (p.costs) caption = `${p.costs.calls.length} model calls · ${(p.costs.totalPromptTokens + p.costs.totalCompletionTokens).toLocaleString()} tokens`;
  else caption = "Session complete";

  return (
    <div className={`floor floor-${p.mode}`}>
      <div className="floor-head">
        <h2>{p.mode === "preview" ? "The committee" : "Committee session"}</h2>
        <span className="floor-caption" aria-live="polite">
          {p.mode === "running" && <i className="live" aria-hidden="true" />}
          {caption}
        </span>
        {total > 0 && <span className="floor-clock num">{secs(total)}</span>}
      </div>
      <div className="floor-grid">
        <div className="floor-col">{seat("news")}</div>
        <div className={`wire ${flowing(["analysts"]) ? "flowing" : ""}`} aria-hidden="true" />
        <div className="floor-col">{ANALYSTS.map(seat)}</div>
        <div className={`wire ${flowing(["rebuttals", "chair"]) ? "flowing" : ""}`} aria-hidden="true" />
        <div className="floor-col">{seat("chair")}</div>
      </div>
    </div>
  );
}
