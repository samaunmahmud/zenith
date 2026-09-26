import type { AnalystName, AnalystReport, ChairDecision } from "../types";
import { ConfidenceBar, TierBadge } from "./common";

const SHORT: Record<AnalystName, string> = { fundamentals: "Fundamentals", technicals: "Technicals", risk: "Risk" };
const SIGN = { bullish: 1, neutral: 0, bearish: -1, BUY: 1, HOLD: 0, SELL: -1 } as const;

/** −1 (strongly bearish) … +1 (strongly bullish), mapped to 0–100% along the track. */
const position = (sign: number, confidence: number) => 50 + sign * confidence * 50;
/** Near either end, hang the label inwards so it never runs off a narrow screen; the stem still marks the exact point. */
const edge = (x: number) => (x > 78 ? "edge-right" : x < 22 ? "edge-left" : "");

/**
 * Where each analyst landed (stance × confidence) and where the chair came down.
 * A picture of the vote: agreement clusters, dissent stands apart.
 */
function Consensus({ reports, decision }: { reports: AnalystReport[]; decision: ChairDecision }) {
  const counts = { bullish: 0, neutral: 0, bearish: 0 };
  reports.forEach((r) => counts[r.stance]++);
  // Nudge markers that would overlap so every label stays readable.
  const placed = [...reports]
    .map((r) => ({ r, x: position(SIGN[r.stance], r.confidence) }))
    .sort((a, b) => a.x - b.x)
    .map((m, i, all) => ({ ...m, row: i > 0 && m.x - all[i - 1].x < 16 ? 1 : 0 }));

  return (
    <div className="consensus" role="img" aria-label={`Analysts: ${counts.bullish} bullish, ${counts.neutral} neutral, ${counts.bearish} bearish. Chair: ${decision.recommendation}.`}>
      <div className="row spread">
        <span className="label">The vote</span>
        <span className="small muted num">
          <span className="stance-bullish">{counts.bullish} bullish</span> · <span className="stance-neutral">{counts.neutral} neutral</span> ·{" "}
          <span className="stance-bearish">{counts.bearish} bearish</span>
        </span>
      </div>
      <div className="track-wrap">
        {placed.map(({ r, x, row }) => (
          <div
            key={r.analyst}
            className={`pin stance-${r.stance} ${edge(x)} ${decision.dissent?.analyst === r.analyst ? "dissenter" : ""}`}
            style={{ left: `${x}%`, top: row ? 26 : 0, ["--stem" as string]: `${row ? 10 : 36}px` }}
            title={`${SHORT[r.analyst]}: ${r.stance}, ${Math.round(r.confidence * 100)}% confidence`}
          >
            <span>{SHORT[r.analyst]}</span>
            <i />
          </div>
        ))}
        <div className="track" />
        <div className={`chair-pin call-${decision.recommendation} ${edge(position(SIGN[decision.recommendation], decision.confidence))}`} style={{ left: `${position(SIGN[decision.recommendation], decision.confidence)}%` }}>
          <i />
          <span>Chair · {decision.recommendation}</span>
        </div>
      </div>
      <div className="track-scale small dim">
        <span>Bearish</span>
        <span>Neutral</span>
        <span>Bullish</span>
      </div>
    </div>
  );
}

export function Verdict({ decision, reports }: { decision: ChairDecision; reports: AnalystReport[] }) {
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
          <p className="verdict-summary">{d.summary}</p>
        </div>
      </div>

      {reports.length > 0 && <Consensus reports={reports} decision={d} />}

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
          <div className="label">Dissent on the record · {SHORT[d.dissent.analyst]} analyst</div>
          <div style={{ marginTop: 4 }}>{d.dissent.argument}</div>
        </div>
      ) : (
        <p className="small muted" style={{ marginTop: 20 }}>No dissent recorded: the committee was unanimous.</p>
      )}
    </div>
  );
}
