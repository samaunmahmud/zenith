import type { CommitteeState } from "../../state/committee";
import type { AnalystReport, ChairDecision, Stance } from "../../types";
import { ANALYSTS, ANALYST_TITLE } from "../../lib/format";
import { statusAt } from "../../lib/tape";
import type { Playback } from "../../hooks/usePlayback";
import { Panel, TierTag } from "./Panel";

/** Where a view sits on the bearish (0) to bullish (1) axis: its direction, pushed out by its confidence. */
export function axisPos(stance: Stance, confidence: number): number {
  if (stance === "neutral") return 0.5;
  const reach = 0.5 * Math.min(1, Math.max(0, confidence));
  return stance === "bullish" ? 0.5 + reach : 0.5 - reach;
}

const CALL_STANCE: Record<ChairDecision["recommendation"], Stance> = { BUY: "bullish", HOLD: "neutral", SELL: "bearish" };

function Track({ pos, tone, pending, label }: { pos: number | null; tone: string; pending: boolean; label: string }) {
  return (
    <div className={`axis ${pending ? "is-pending" : ""}`} role="img" aria-label={label}>
      <span className="axis-mid" aria-hidden="true" />
      <span className={`axis-dot ${tone}`} style={{ left: `${(pos ?? 0.5) * 100}%`, opacity: pos === null ? 0 : 1 }} aria-hidden="true" />
    </div>
  );
}

/** Each analyst's position on one axis, landing as its report comes in; the chair's call sits underneath. */
export function StanceBoard({ state, play, decision, id = "vot" }: { state: CommitteeState; play: Playback; decision: ChairDecision | null; id?: string }) {
  const { tape, t } = play;
  const seen = (id: string) => {
    const p = tape.procs.find((x) => x.id === id);
    return p ? statusAt(p, t) === "done" : false;
  };
  const tier = (id: string) => tape.procs.find((x) => x.id === id)?.tier ?? state.agents.find((a) => a.id === id)?.tier ?? null;
  const shown: AnalystReport[] = ANALYSTS.map((a) => (seen(a) ? state.reports[a] : undefined)).filter((r): r is AnalystReport => Boolean(r));
  const tally = (s: Stance) => shown.filter((r) => r.stance === s).length;

  return (
    <Panel title="Analyst stances" id={id}
      meta={shown.length ? <span className="num"><b className="pos">{tally("bullish")}</b> bull · <b className="warn">{tally("neutral")}</b> neutral · <b className="neg">{tally("bearish")}</b> bear</span> : "awaiting reports"}>
      <div className="stance-grid">
        <div className="axis-legend" aria-hidden="true"><span>Bearish</span><span>Neutral</span><span>Bullish</span></div>
        {ANALYSTS.map((a) => {
          const r = seen(a) ? state.reports[a] : undefined;
          const changed = seen(`${a}-rebuttal`) && state.debate.find((x) => x.analyst === a)?.stanceChanged;
          const failed = seen(a) === false && Boolean(state.errors[a]) && play.finished;
          return (
            <div key={a} className={`stance-row id-${a}`}>
              <div className="stance-who">
                <i className="id-mark" aria-hidden="true" /><b>{ANALYST_TITLE[a]}</b> <TierTag tier={tier(a)} />
                <span className={`stance-val ${r ? `stance-${r.stance}` : "dim"}`}>
                  {r ? `${r.stance} ${Math.round(r.confidence * 100)}%` : failed ? "no report" : "…"}
                </span>
                {changed && <span className="t-changed" title="Changed position after the rebuttal round">Δ REVISED</span>}
              </div>
              <Track pos={r ? axisPos(r.stance, r.confidence) : null} tone={r ? `stance-${r.stance}` : ""} pending={!r}
                label={r ? `${ANALYST_TITLE[a]}: ${r.stance}, ${Math.round(r.confidence * 100)}% confidence` : `${ANALYST_TITLE[a]}: no report yet`} />
            </div>
          );
        })}
        <div className="stance-row is-chair id-chair">
          <div className="stance-who">
            <i className="id-mark" aria-hidden="true" /><b>Chair</b> <TierTag tier={tier("chair")} />
            <span className={`stance-val ${decision ? `call-${decision.recommendation}` : "dim"}`}>
              {decision ? `${decision.recommendation} ${Math.round(decision.confidence * 100)}%` : "…"}
            </span>
          </div>
          <Track pos={decision ? axisPos(CALL_STANCE[decision.recommendation], decision.confidence) : null}
            tone={decision ? `call-${decision.recommendation}` : ""} pending={!decision}
            label={decision ? `Chair: ${decision.recommendation}, ${Math.round(decision.confidence * 100)}% confidence` : "Chair: no ruling yet"} />
        </div>
      </div>
    </Panel>
  );
}
