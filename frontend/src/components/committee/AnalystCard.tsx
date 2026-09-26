import type { AgentModel, AnalystName, AnalystReport } from "../../types";
import { ANALYST_TITLE } from "../../lib/format";
import { ConfidenceBar, TierBadge } from "../ui/Badges";
import { Term } from "../ui/Term";

interface Props {
  analyst: AnalystName;
  agent: AgentModel | undefined;
  report: AnalystReport | undefined;
  error: string | undefined;
  pending: boolean;
  halted: boolean; // the run stopped before this analyst reported
  facts: Record<string, string> | undefined;
}

/** The exact fact sheet this analyst was given: every number it is allowed to use. */
function FactSheet({ facts }: { facts: Record<string, string> | undefined }) {
  if (!facts) return null;
  return (
    <details className="facts">
      <summary>What this analyst sees ({Object.keys(facts).length} figures)</summary>
      <dl className="num">
        {Object.entries(facts).map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <dt><Term label={k} /></dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function AnalystCard({ analyst, agent, report, error, pending, halted, facts }: Props) {
  const head = (
    <header className="card-head">
      <h2>{ANALYST_TITLE[analyst]} analyst</h2>
      {agent && <TierBadge tier={agent.tier} />}
    </header>
  );

  if (error) {
    return (
      <article className="card acard">
        {head}
        <div className="card-body">
          <p className="neg" style={{ fontWeight: 600 }}>No valid report</p>
          <p className="muted small">
            {halted
              ? "This analyst couldn't produce a valid report, and the committee stopped before a decision."
              : "This analyst couldn't produce a valid report, so the chair decided without it."}
          </p>
          <p className="dim xs mono">{error}</p>
        </div>
        <FactSheet facts={facts} />
      </article>
    );
  }

  if (!report) {
    return (
      <article className="card acard" aria-busy={pending}>
        {head}
        <div className="card-body">
          {pending ? (
            <>
              <p className="small" style={{ color: "var(--accent)" }}>Analysing…</p>
              <div className="skeleton" style={{ width: "40%", height: 18 }} />
              <div className="skeleton" style={{ width: "88%" }} />
              <div className="skeleton" style={{ width: "72%" }} />
              <div className="skeleton" style={{ width: "80%" }} />
            </>
          ) : (
            <p className="small dim">{halted ? "Not run: the committee stopped before this analyst reported." : "Waiting for market data…"}</p>
          )}
        </div>
        <FactSheet facts={facts} />
      </article>
    );
  }

  return (
    <article className="card acard">
      {head}
      <div className="card-body">
        <div>
          <div className="acard-stance">
            <b className={`stance-${report.stance}`}>{report.stance}</b>
            <span className="small dim num">{Math.round(report.confidence * 100)}% confidence</span>
          </div>
          <ConfidenceBar value={report.confidence} className={`stance-${report.stance}`} />
        </div>
        <p className="headline">{report.headline}</p>
        <ul>{report.keyPoints.map((p, i) => <li key={i}>{p}</li>)}</ul>
        {report.evidence.length > 0 && (
          <table className="evidence num">
            <thead>
              <tr><th>Evidence</th><th>Value</th><th>Reading</th></tr>
            </thead>
            <tbody>
              {report.evidence.map((e, i) => (
                <tr key={i}>
                  <td><Term label={e.metric} /></td>
                  <td>{e.value}</td>
                  <td>{e.interpretation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {report.concerns.length > 0 && (
          <div className="concerns">
            <b>Could be wrong if:</b> {report.concerns.join(" · ")}
          </div>
        )}
      </div>
      <FactSheet facts={facts} />
    </article>
  );
}
