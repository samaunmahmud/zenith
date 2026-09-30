import type { CommitteeState } from "../../state/committee";
import type { ChairDecision, Trigger, WatchStatus } from "../../types";
import { ANALYSTS, ANALYST_TITLE, modelName, shortDate } from "../../lib/format";
import { statusAt, type Phase, type ProcStatus } from "../../lib/tape";
import { firstAnalyst, splitSource } from "../../lib/rationale";
import type { Playback } from "../../hooks/usePlayback";
import { TierTag } from "./Panel";

/** A ring filled to the chair's confidence. */
function Gauge({ value, call }: { value: number; call: ChairDecision["recommendation"] }) {
  const r = 46;
  const len = 2 * Math.PI * r;
  return (
    <svg className={`gauge call-${call}`} viewBox="0 0 112 112" aria-hidden="true">
      <circle className="gauge-track" cx="56" cy="56" r={r} />
      <circle className="gauge-fill" cx="56" cy="56" r={r} strokeDasharray={`${len * value} ${len}`} transform="rotate(-90 56 56)" />
      <text x="56" y="58" textAnchor="middle" className="gauge-num">{Math.round(value * 100)}%</text>
      <text x="56" y="75" textAnchor="middle" className="gauge-lbl">confidence</text>
    </svg>
  );
}

const STEPS: { phase: Phase; label: string }[] = [
  { phase: "clerk", label: "Figures" },
  { phase: "news", label: "News" },
  { phase: "analysts", label: "Analysts" },
  { phase: "rebuttals", label: "Rebuttals" },
  { phase: "chair", label: "Chair" },
];

/** Where the session is: one step per stage, each done, running or still to come. */
function Stepper({ play }: { play: Playback }) {
  const steps = STEPS.map((s) => {
    const procs = play.tape.procs.filter((p) => p.phase === s.phase);
    const sts = procs.map((p) => statusAt(p, play.t));
    const st: ProcStatus | "none" = procs.length === 0 ? "none" : sts.some((x) => x === "running") ? "running"
      : sts.every((x) => x === "done" || x === "failed") ? "done" : "queued";
    return { ...s, st };
  }).filter((s) => s.st !== "none");
  return (
    <ol className="stepper">
      {steps.map((s, i) => (
        <li key={s.phase} className={`is-${s.st}`}>
          <span className="step-dot" aria-hidden="true">{s.st === "done" ? "✓" : i + 1}</span>
          <span className="step-lbl">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

/** The chair's watch list in words: each trigger's condition comes from the snapshot's menu, computed in code. */
export function watchItems(decision: ChairDecision, triggers: Trigger[] | null | undefined, checked?: WatchStatus[]) {
  return (decision.watchFor ?? []).flatMap((w) => {
    const t = triggers?.find((x) => x.id === w.trigger);
    return t ? [{ ...w, condition: t.condition, status: checked?.find((c) => c.trigger === w.trigger) }] : [];
  });
}

/** "What would change the call": each condition, what the call would become, and (for a saved ruling) whether it has happened. */
function WatchList({ decision, triggers, checked }: { decision: ChairDecision; triggers: Trigger[] | null | undefined; checked?: WatchStatus[] }) {
  const items = watchItems(decision, triggers, checked);
  if (!items.length) return null;
  return (
    <div className="vh-watch">
      <h3 className="vh-side-h">What would change the call</h3>
      <ul>
        {items.map((w) => (
          <li key={w.trigger} className={w.status?.metOn ? "is-met" : undefined}>
            <div className="vw-head">
              <b>{w.condition}</b>
              <span className={`call-pill call-${w.wouldMoveTo}`}>→ {w.wouldMoveTo}</span>
            </div>
            <p>{w.reason}</p>
            {w.status && (
              <p className="vw-status">
                {w.status.metOn ? <span className="warn">Met on {shortDate(w.status.metOn)}</span> : <span className="dim">Not met yet</span>}
                {w.status.now && <span className="dim"> · now {w.status.now}</span>}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface Props {
  state: CommitteeState;
  play: Playback;
  decision: ChairDecision | null;
  id?: string;
  /** Leave out the numbered reasons (a side of a head-to-head has room for the call, summary and dissent only). */
  compact?: boolean;
  /** The watch list checked against closes since the ruling (saved rulings only). */
  watch?: WatchStatus[];
}

/** The chair's ruling as the page's headline: the session's progress until then, then the call and why. */
export function VerdictPanel({ state, play, decision, id = "ruling", compact = false, watch }: Props) {
  const chair = play.tape.procs.find((p) => p.id === "chair");
  const st = chair ? statusAt(chair, play.t) : "queued";
  const model = modelName(chair?.model ?? state.agents.find((a) => a.id === "chair")?.model) ?? "Nemotron Ultra";
  const noDecision = play.finished && !decision;
  const tally = (s: string) => ANALYSTS.filter((a) => state.reports[a]?.stance === s).length;

  const dissent = decision?.dissent && (
    <div className="vh-dissent">
      <span className="vh-dissent-lbl"><i className={`id-mark id-${decision.dissent.analyst}`} aria-hidden="true" />Dissent on the record · {ANALYST_TITLE[decision.dissent.analyst]}</span>
      <p>{decision.dissent.argument}</p>
    </div>
  );

  return (
    <section className={`verdict-hero ${compact ? "is-compact" : ""} ${decision ? `has-call glow-${decision.recommendation}` : ""}`} id={id} aria-labelledby={`${id}-h`}>
      <div className="vh-main">
        <p className="vh-eyebrow" id={`${id}-h`}><TierTag tier="ultra" /> <span>The chair&apos;s ruling</span> <span className="dim">· {model}</span></p>
        {decision ? (
          <div className="vh-on">
            <div className="vh-callrow">
              <div>
                <div className={`vh-call call-${decision.recommendation}`}>{decision.recommendation}</div>
                <p className="vh-sub">{decision.timeHorizon} horizon · analysts <span className="pos">{tally("bullish")} bullish</span>, <span className="warn">{tally("neutral")} neutral</span>, <span className="neg">{tally("bearish")} bearish</span></p>
              </div>
              <Gauge value={decision.confidence} call={decision.recommendation} />
            </div>
            <p className="vh-summary">{decision.summary}</p>
            {compact ? dissent : play.finished && <WatchList decision={decision} triggers={state.snapshot?.triggers} checked={watch} />}
          </div>
        ) : noDecision ? (
          <div className="vh-wait"><h2 className="neg">No ruling</h2><p>{state.result?.chairError ?? state.error ?? "The chair didn't return a valid decision."}</p></div>
        ) : (
          <div className={`vh-wait ${st === "running" ? "is-deliberating" : ""}`}>
            <h2>{st === "running" ? "The chair is deliberating" : "Committee in session"}</h2>
            <p>{st === "running"
              ? "Nemotron Ultra is weighing every report and rebuttal. One call, on the committee's strongest model."
              : "The analysts are building their cases from figures computed in code. The chair speaks last."}</p>
            <Stepper play={play} />
          </div>
        )}
      </div>
      {decision && !compact && (
        <div className="vh-side">
          <h3 className="vh-side-h">Why</h3>
          <ol className="vh-why">
            {decision.rationale.map((x) => {
              const { source, body } = splitSource(x);
              const who = firstAnalyst(source);
              return <li key={x}>{source && <span className={`vsrc ${who ? `id-${who}` : ""}`}><i className="id-mark" aria-hidden="true" />{source}</span>}<span>{body}</span></li>;
            })}
          </ol>
          {dissent}
        </div>
      )}
    </section>
  );
}
