import type { CommitteeState } from "../../state/committee";
import { ANALYST_TITLE } from "../../lib/format";
import { Card } from "../ui/Card";

/** The rebuttal round as an exchange: who replied to whom, coloured by each speaker's stance. */
export function DebateTab({ state }: { state: CommitteeState }) {
  const stance = (a: keyof typeof ANALYST_TITLE) => state.reports[a]?.stance ?? "neutral";
  if (state.debate.length === 0) {
    const waiting = state.status === "running" && state.rebuttals;
    return (
      <Card>
        <div className="empty">
          <b>{waiting ? "The rebuttal round starts once the analysts have reported." : "No rebuttal round in this session."}</b>
          {!waiting && <>Switch on “Rebuttal round” before convening to have each analyst answer the colleague it disagrees with most.</>}
        </div>
      </Card>
    );
  }
  return (
    <div className="stack-16" style={{ maxWidth: 860 }}>
      <p className="muted">One reply each, to the colleague it disagrees with most. No open-ended debate loops.</p>
      <div className="debate">
        {state.debate.map((r) => (
          <div className="turn" key={r.analyst}>
            <span className={`avatar ${stance(r.analyst)}`} aria-hidden="true">{ANALYST_TITLE[r.analyst][0]}</span>
            <div className="bubble">
              <div className="who">
                <b>{ANALYST_TITLE[r.analyst]}</b> replying to <b>{ANALYST_TITLE[r.respondingTo]}</b>
                {r.stanceChanged && <span className="badge neutral" style={{ marginLeft: 8 }}>changed stance</span>}
              </div>
              <p>{r.response}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
