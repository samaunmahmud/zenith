import type { ChairDecision } from "../types";
import { ConfidenceBar, TierBadge } from "./common";

export function Verdict({ decision }: { decision: ChairDecision }) {
  const d = decision;
  return (
    <div className="panel verdict">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>The Chair's decision</h2>
        <TierBadge tier="ultra" />
      </div>
      <div className="verdict-top">
        <div className={`call call-${d.recommendation}`}>{d.recommendation}</div>
        <div style={{ flex: "1 1 260px" }}>
          <div className="small muted num">
            Confidence {Math.round(d.confidence * 100)}% · horizon {d.timeHorizon}
          </div>
          <ConfidenceBar value={d.confidence} className={`call-${d.recommendation}`} />
          <p style={{ marginBottom: 0 }}>{d.summary}</p>
        </div>
      </div>

      <div className="verdict-grid">
        <div>
          <h3 className="small muted">RATIONALE</h3>
          <ul>
            {d.rationale.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="small muted">KEY RISKS</h3>
          <ul>
            {d.keyRisks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      </div>

      {d.dissent ? (
        <div className="dissent">
          <div className="label">Dissent · {d.dissent.analyst} analyst</div>
          <div>{d.dissent.argument}</div>
        </div>
      ) : (
        <p className="small muted">No dissent recorded: the committee was unanimous.</p>
      )}
    </div>
  );
}
