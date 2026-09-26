import type { AgentModel, AnalystName, AnalystReport } from "../types";
import { ConfidenceBar, TierBadge } from "./common";

interface Props {
  analyst: AnalystName;
  agent: AgentModel | undefined;
  report: AnalystReport | undefined;
  error: string | undefined;
  pending: boolean;
  halted: boolean; // the run stopped before this analyst reported
  facts: Record<string, string> | undefined;
}

const TITLES: Record<AnalystName, string> = { fundamentals: "Fundamentals", technicals: "Technicals", risk: "Risk" };

/** The exact fact sheet this analyst was given: every number it is allowed to use. */
function FactSheet({ facts }: { facts: Record<string, string> | undefined }) {
  if (!facts) return null;
  return (
    <details className="facts">
      <summary>What this analyst sees</summary>
      <dl className="num">
        {Object.entries(facts).map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function AnalystCard({ analyst, agent, report, error, pending, halted, facts }: Props) {
  const head = (
    <div className="card-head">
      <div>
        <div className="label">Analyst</div>
        <h3>{TITLES[analyst]}</h3>
      </div>
      {agent && <TierBadge tier={agent.tier} />}
    </div>
  );

  if (error) {
    return (
      <div className={`panel card ${halted ? "" : "failed"}`}>
        {head}
        <p className="small">
          {halted
            ? "Not run: the AI analysis is unavailable right now. The data this analyst would use is below."
            : "This analyst couldn't produce a valid report, so the chair decided without it."}
        </p>
        <p className="small dim">{error}</p>
        <FactSheet facts={facts} />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="panel card" aria-busy={pending}>
        {head}
        {pending ? (
          <>
            <p className="small muted">Analysing…</p>
            <div className="skeleton" style={{ width: "85%" }} />
            <div className="skeleton" style={{ width: "70%" }} />
            <div className="skeleton" style={{ width: "78%" }} />
          </>
        ) : (
          <p className="small dim">{halted ? "Not run: the committee stopped before this analyst reported." : "Waiting for market data…"}</p>
        )}
        <FactSheet facts={facts} />
      </div>
    );
  }

  return (
    <div className={`panel card stance-card-${report.stance}`}>
      {head}
      <div className="row spread">
        <span className={`stance stance-${report.stance}`}>{report.stance.toUpperCase()}</span>
        <span className="small muted num">{Math.round(report.confidence * 100)}% confidence</span>
      </div>
      <ConfidenceBar value={report.confidence} className={`stance-${report.stance}`} />
      <p className="headline">{report.headline}</p>
      <ul>
        {report.keyPoints.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
      <table className="evidence num">
        <tbody>
          {report.evidence.map((e, i) => (
            <tr key={i}>
              <td>{e.metric}</td>
              <td>{e.value}</td>
              <td>{e.interpretation}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {report.concerns.length > 0 && (
        <div className="concerns">
          <b>Could be wrong if:</b> {report.concerns.join(" · ")}
        </div>
      )}
      <FactSheet facts={facts} />
    </div>
  );
}
