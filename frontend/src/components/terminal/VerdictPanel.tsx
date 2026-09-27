import type { CommitteeState } from "../../state/committee";
import type { ChairDecision } from "../../types";
import { ANALYST_TITLE } from "../../lib/format";
import { statusAt } from "../../lib/tape";
import { firstAnalyst, splitSource } from "../../lib/rationale";
import type { Playback } from "../../hooks/usePlayback";
import { modelName } from "../boardroom/BoardTable";
import { Panel } from "./Panel";

/** A 240° dial, filled to the chair's confidence. */
function Gauge({ value, call }: { value: number; call: ChairDecision["recommendation"] }) {
  const r = 52;
  const len = (240 / 360) * 2 * Math.PI * r;
  return (
    <svg className={`gauge call-${call}`} viewBox="0 0 128 112" aria-hidden="true">
      <circle className="gauge-track" cx="64" cy="64" r={r} pathLength={len} strokeDasharray={`${len} 999`} transform="rotate(150 64 64)" />
      <circle className="gauge-fill" cx="64" cy="64" r={r} pathLength={len} strokeDasharray={`${len * value} 999`} transform="rotate(150 64 64)" />
      <text x="64" y="66" textAnchor="middle" className="gauge-num">{Math.round(value * 100)}%</text>
      <text x="64" y="84" textAnchor="middle" className="gauge-lbl">CONFIDENCE</text>
    </svg>
  );
}

/** The chair's ruling: waiting, deliberating, then the call with its confidence, reasons and dissent. */
export function VerdictPanel({ state, play, decision }: { state: CommitteeState; play: Playback; decision: ChairDecision | null }) {
  const chair = play.tape.procs.find((p) => p.id === "chair");
  const st = chair ? statusAt(chair, play.t) : "queued";
  const model = modelName(chair?.model ?? state.agents.find((a) => a.id === "chair")?.model) ?? "Nemotron Ultra";
  const noDecision = play.finished && !decision;

  return (
    <Panel code="RUL" title="Chair's ruling" id="rul" className="tverdict"
      meta={<span>{model}</span>}>
      {decision ? (
        <div className="verdict-on">
          <div className="verdict-top">
            <div>
              <div className={`verdict-call call-${decision.recommendation}`}>{decision.recommendation}</div>
              <div className="verdict-sub">{decision.timeHorizon} horizon</div>
            </div>
            <Gauge value={decision.confidence} call={decision.recommendation} />
          </div>
          <p className="verdict-summary">{decision.summary}</p>
          <ol className="verdict-why">
            {decision.rationale.map((x) => {
              const { source, body } = splitSource(x);
              const who = firstAnalyst(source);
              return <li key={x}>{source && <span className={`vsrc ${who ? `id-${who}` : ""}`}><i className="id-mark" aria-hidden="true" />{source}</span>}{body}</li>;
            })}
          </ol>
          {decision.dissent && (
            <div className="verdict-dissent">
              <span className="lbl">▲ Dissent on the record · {ANALYST_TITLE[decision.dissent.analyst]}</span>
              <p>{decision.dissent.argument}</p>
            </div>
          )}
        </div>
      ) : noDecision ? (
        <div className="verdict-wait"><b className="neg">NO RULING</b><p>{state.result?.chairError ?? state.error ?? "The chair didn't return a valid decision."}</p></div>
      ) : (
        <div className={`verdict-wait ${st === "running" ? "is-deliberating" : ""}`}>
          <b>{st === "running" ? "DELIBERATING" : "AWAITING ARGUMENTS"}</b>
          <p>{st === "running" ? "Weighing three reports and the rebuttals. One call, the committee's strongest model." : "The chair speaks last, after every analyst has put its case."}</p>
          <div className="scan" aria-hidden="true"><i /></div>
        </div>
      )}
    </Panel>
  );
}
