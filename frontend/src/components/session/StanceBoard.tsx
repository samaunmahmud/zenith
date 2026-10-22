import type { CommitteeState } from "../../state/committee";
import type { AnalystReport, ChairDecision, Stance } from "../../types";
import { ANALYSTS, ANALYST_TITLE } from "../../lib/format";
import { statusAt } from "../../lib/tape";
import type { Playback } from "../../hooks/usePlayback";
import { Panel, TierTag } from "./Panel";
import { afterRebuttal, shiftLabel, shiftTitle } from "../../lib/revision";

/** Where a view sits on the bearish (0) to bullish (1) axis: its direction, pushed out by its confidence. */
export function axisPos(stance: Stance, confidence: number): number {
  if (stance === "neutral") return 0.5;
  const reach = 0.5 * Math.min(1, Math.max(0, confidence));
  return stance === "bullish" ? 0.5 + reach : 0.5 - reach;
}

const CALL_STANCE: Record<ChairDecision["recommendation"], Stance> = { BUY: "bullish", HOLD: "neutral", SELL: "bearish" };

function Track({ pos, tone, pending, label, from }: { pos: number | null; tone: string; pending: boolean; label: string; from?: { pos: number; tone: string } }) {
  return (
    <div className={`axis ${pending ? "is-pending" : ""}`} role="img" aria-label={label}>
      <span className="axis-mid" aria-hidden="true" />
      {from && <span className={`axis-ghost ${from.tone}`} style={{ left: `${from.pos * 100}%` }} aria-hidden="true" />}
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
          const rb = seen(`${a}-rebuttal`) ? state.debate.find((x) => x.analyst === a) : undefined;
          const shift = shiftLabel(rb);
          // Once the rebuttal lands, a measured change slides the dot to where the analyst ended up, leaving a ghost behind.
          const after = r ? afterRebuttal(rb) : null;
          const now = after ?? r;
          const failed = seen(a) === false && Boolean(state.errors[a]) && play.finished;
          return (
            <div key={a} className={`stance-row id-${a}`}>
              <div className="stance-who">
                <i className="id-mark" aria-hidden="true" /><b>{ANALYST_TITLE[a]}</b> <TierTag tier={tier(a)} />
                <span className={`stance-val ${r ? `stance-${r.stance}` : "dim"}`}>
                  {r ? `${r.stance} ${Math.round(r.confidence * 100)}%` : failed ? "no report" : "…"}
                </span>
                {rb && shift && <span className="t-changed" title={shiftTitle(rb)}>Δ {shift.toUpperCase()}</span>}
              </div>
              <Track pos={now ? axisPos(now.stance, now.confidence) : null} tone={now ? `stance-${now.stance}` : ""} pending={!r}
                from={r && after && rb?.stanceChanged ? { pos: axisPos(r.stance, r.confidence), tone: `stance-${r.stance}` } : undefined}
                label={!r ? `${ANALYST_TITLE[a]}: no report yet`
                  : after && rb?.stanceChanged ? `${ANALYST_TITLE[a]}: moved from ${r.stance} ${Math.round(r.confidence * 100)}% to ${after.stance} ${Math.round(after.confidence * 100)}% after the rebuttal round`
                  : `${ANALYST_TITLE[a]}: ${r.stance}, ${Math.round(r.confidence * 100)}% confidence`} />
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
