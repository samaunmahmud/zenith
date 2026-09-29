import type { CommitteeState } from "../../state/committee";
import type { AnalystName } from "../../types";
import { ANALYSTS, ANALYST_TITLE, modelName } from "../../lib/format";
import { statusAt } from "../../lib/tape";
import type { Playback } from "../../hooks/usePlayback";
import { TierTag } from "./Panel";
import { axisPos } from "./StanceBoard";
import { Typed } from "./Typed";

const REMIT: Record<AnalystName, string> = {
  fundamentals: "Valuation, growth, margins, balance sheet",
  technicals: "Trend, momentum, moving averages",
  risk: "Volatility, drawdown, beta, liquidity",
};

function Card({ a, state, play }: { a: AnalystName; state: CommitteeState; play: Playback }) {
  const { tape, t } = play;
  const proc = tape.procs.find((p) => p.id === a);
  const st = proc ? statusAt(proc, t) : state.status === "running" ? "queued" : "done";
  const r = st === "done" ? state.reports[a] : undefined;
  const failed = st === "failed" || (play.finished && !state.reports[a] && Boolean(state.errors[a]));
  const rbProc = tape.procs.find((p) => p.id === `${a}-rebuttal`);
  const rb = rbProc && statusAt(rbProc, t) === "done" ? state.debate.find((x) => x.analyst === a) : undefined;
  const flags = state.result?.integrity.find((f) => f.agent === a)?.figures ?? [];
  const rbFlags = state.result?.integrity.find((f) => f.agent === `${a}-rebuttal`)?.figures ?? [];
  const checked = Boolean(state.result) && play.finished;
  const facts = Object.keys(state.snapshot?.facts[a] ?? {}).length;
  const tier = proc?.tier ?? state.agents.find((x) => x.id === a)?.tier ?? null;
  const model = proc?.model ?? state.agents.find((x) => x.id === a)?.model;
  const elapsed = proc?.start != null && st === "running" ? (t - proc.start) / 1000 : null;

  return (
    <article className={`acard2 id-${a} is-${failed ? "failed" : r ? "done" : st}`}>
      <header className="ac-head">
        <div className="ac-who">
          <i className="id-mark" aria-hidden="true" />
          <div>
            <h3>{ANALYST_TITLE[a]}</h3>
            <p className="ac-remit">{REMIT[a]}</p>
          </div>
        </div>
        <div className="ac-model"><TierTag tier={tier} /><span className="dim xs">{modelName(model)?.replace(/^Nemotron /, "")}</span></div>
      </header>

      {r ? (
        <div className="ac-body">
          <div className="ac-stance">
            <span className={`ac-call stance-${r.stance}`}>{r.stance}</span>
            <span className="ac-conf num">{Math.round(r.confidence * 100)}%</span>
            {rb?.stanceChanged && <span className="ac-revised" title="Changed position after the rebuttal round">Revised</span>}
          </div>
          <div className="ac-axis" role="img" aria-label={`${r.stance}, ${Math.round(r.confidence * 100)}% confidence`}>
            <span className="ac-axis-mid" />
            <span className={`ac-axis-dot stance-${r.stance}`} style={{ left: `${axisPos(r.stance, r.confidence) * 100}%` }} />
          </div>
          <p className="ac-headline"><Typed text={r.headline} flagged={flags} checked={checked} animate={!play.finished} /></p>
          <ul className="ac-points">
            {r.keyPoints.slice(0, 3).map((x) => <li key={x}><Typed text={x} flagged={flags} checked={checked} animate={false} /></li>)}
          </ul>
          {rb && (
            <div className="ac-rebuttal">
              <span className="ac-rb-lbl">Rebuttal to {ANALYST_TITLE[rb.respondingTo]}</span>
              <p><Typed text={rb.response} flagged={rbFlags} checked={checked} animate={!play.finished} /></p>
            </div>
          )}
        </div>
      ) : failed ? (
        <div className="ac-body ac-wait"><p className="neg">No valid report after a retry. The committee continues without it.</p></div>
      ) : st === "running" ? (
        <div className="ac-body ac-wait">
          <p className="ac-status"><span className="spin-dots" aria-hidden="true"><i /><i /><i /></span> Reading {facts || "its"} figures and forming a view{elapsed !== null && <span className="num dim"> · {elapsed.toFixed(1)}s</span>}</p>
          <div className="skel" aria-hidden="true"><i /><i /><i /></div>
        </div>
      ) : (
        <div className="ac-body ac-wait"><p className="dim">Waiting for the fact sheet.</p><div className="skel is-idle" aria-hidden="true"><i /><i /></div></div>
      )}
    </article>
  );
}

/** The three analysts side by side: each one's position, how sure it is, and why, landing as it reports. */
export function AnalystCards({ state, play }: { state: CommitteeState; play: Playback }) {
  return (
    <section className="acards" aria-label="Analyst reports">
      {ANALYSTS.map((a) => <Card key={a} a={a} state={state} play={play} />)}
    </section>
  );
}
