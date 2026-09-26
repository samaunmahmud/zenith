import type { CommitteeState } from "../../state/committee";
import { ANALYST_TITLE } from "../../lib/format";
import { Card } from "../ui/Card";

/** The rebuttal round, set out like minutes: speaker and addressee in the margin, what they said beside it. */
export function DebateTab({ state }: { state: CommitteeState }) {
  const stance = (a: keyof typeof ANALYST_TITLE) => state.reports[a]?.stance ?? "neutral";
  if (state.debate.length === 0) {
    const waiting = state.status === "running" && state.rebuttals;
    return (
      <Card>
        <div className="empty">
          <b>{waiting ? "The rebuttal round starts once the analysts have reported." : "No rebuttal round in this session."}</b>
          {!waiting && <>Tick “Allow a rebuttal round” before convening to have each analyst answer the colleague it disagrees with most.</>}
        </div>
      </Card>
    );
  }
  return (
    <div className="stack-16" style={{ maxWidth: 860 }}>
      <p className="muted">One reply each, to the colleague it disagrees with most. No open-ended debate loops.</p>
      <ol className="minutes">
        {state.debate.map((r) => (
          <li key={r.analyst}>
            <div className="speaker">
              <b className={`stance-${stance(r.analyst)}`}>{ANALYST_TITLE[r.analyst]}</b>
              <span>to {ANALYST_TITLE[r.respondingTo]}</span>
              {r.stanceChanged && <span className="badge neutral">changed stance</span>}
            </div>
            <p>{r.response}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
