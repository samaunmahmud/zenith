import type { AgentModel, AnalystName, AnalystReport } from "../types";
import { ConfidenceBar, TierBadge } from "./common";

interface Props {
  analyst: AnalystName;
  agent: AgentModel | undefined;
  report: AnalystReport | undefined;
  error: string | undefined;
  pending: boolean;
}

const TITLES: Record<AnalystName, string> = {
  fundamentals: "Fundamentals",
  technicals: "Technicals",
  risk: "Risk",
};

export function AnalystCard({ analyst, agent, report, error, pending }: Props) {
  const head = (
    <div className="card-head">
      <h3>{TITLES[analyst]} Analyst</h3>
      {agent && <TierBadge tier={agent.tier} />}
    </div>
  );

  if (error) {
    return (
      <div className="panel card failed">
        {head}
        <p className="small">This analyst couldn't produce a valid report, so the chair decided without it.</p>
        <p className="small muted">{error}</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="panel card" aria-busy={pending}>
        {head}
        <p className="muted small">{pending ? "Analysing…" : "Waiting"}</p>
        {pending && (
          <>
            <div className="skeleton" style={{ width: "85%" }} />
            <div className="skeleton" style={{ width: "70%" }} />
            <div className="skeleton" style={{ width: "78%" }} />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="panel card">
      {head}
      <div className="row">
        <span className={`badge stance-${report.stance}`}>{report.stance.toUpperCase()}</span>
        <span className="small muted num">confidence {Math.round(report.confidence * 100)}%</span>
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
              <td className="muted">{e.interpretation}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {report.concerns.length > 0 && (
        <div className="concerns">
          <b>Could be wrong if:</b> {report.concerns.join(" · ")}
        </div>
      )}
    </div>
  );
}
