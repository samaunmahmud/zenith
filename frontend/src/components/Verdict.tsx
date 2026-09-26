import type { ChairDecision } from "../types";
import { ConfidenceBar, TierBadge } from "./common";

export function Verdict({ decision }: { decision: ChairDecision }) {
  const d = decision;
  return (
    <div className="verdict">
      <div className="row spread" style={{ marginBottom: 18 }}>
        <span className="label">The chair's decision</span>
        <TierBadge tier="ultra" />
      </div>
      <div className="verdict-top">
        <div className={`call call-${d.recommendation}`}>{d.recommendation}</div>
        <div>
          <div className="row spread small num" style={{ marginBottom: 6 }}>
            <span className="muted">Confidence <b style={{ color: "var(--text)" }}>{Math.round(d.confidence * 100)}%</b></span>
            <span className="muted">Horizon <b style={{ color: "var(--text)" }}>{d.timeHorizon}</b></span>
          </div>
          <ConfidenceBar value={d.confidence} className={`call-${d.recommendation}`} />
          <p style={{ margin: "14px 0 0", fontSize: "1.05rem" }}>{d.summary}</p>
        </div>
      </div>

      <div className="verdict-grid">
        <div>
          <div className="label">Rationale</div>
          <ul>
            {d.rationale.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="label">Key risks</div>
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
          <div style={{ marginTop: 4 }}>{d.dissent.argument}</div>
        </div>
      ) : (
        <p className="small muted" style={{ marginTop: 20 }}>No dissent recorded: the committee was unanimous.</p>
      )}
    </div>
  );
}
