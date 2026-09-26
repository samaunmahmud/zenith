import type { CostSummary, Tier } from "../../types";
import { TIER_LABEL, usd } from "../../lib/format";
import { Card } from "../ui/Card";

const TIERS: Tier[] = ["nano", "super", "ultra"];

/** Actual cost vs the same tokens on Ultra alone: the argument for routing each role to the smallest capable model. */
function Routing({ actual, allUltra }: { actual: number; allUltra: number }) {
  const share = actual / allUltra;
  return (
    <div className="routing">
      <div className="row spread">
        <span className="small" style={{ fontWeight: 600 }}>Tier routing vs Ultra for everything</span>
        <b className="routing-save num">{Math.round((1 - share) * 100)}% cheaper</b>
      </div>
      <div className="routing-bars num">
        <span>This run</span>
        <div className="bar"><div className="actual" style={{ width: `${share * 100}%` }} /></div>
        <span className="val">{usd(actual)}</span>
        <span>All Ultra</span>
        <div className="bar"><div className="ultra" style={{ width: "100%" }} /></div>
        <span className="val">{usd(allUltra)}</span>
      </div>
      <p className="xs dim">Same calls, same tokens, priced at Nemotron Ultra's list price.</p>
    </div>
  );
}

/** What this decision cost, split by Nemotron model, plus the case for tier routing. */
export function CostPanel({ costs }: { costs: CostSummary }) {
  const maxUsd = Math.max(...TIERS.map((t) => costs.byTier[t]?.usd ?? 0), 1e-9);
  const slowest = Math.max(...costs.calls.map((c) => c.latencyMs), 0);
  return (
    <Card title="Committee cost" sub="estimated at Token Factory list prices" flush>
      <div className="metric-row num">
        <div><b className="tier-super">{usd(costs.totalUsd)}</b><span>for this decision</span></div>
        <div><b>{(costs.totalPromptTokens + costs.totalCompletionTokens).toLocaleString()}</b><span>tokens · {costs.calls.length} calls</span></div>
        <div><b>{(slowest / 1000).toFixed(1)}s</b><span>slowest call</span></div>
      </div>
      <div className="tier-bars num">
        {TIERS.map((t) => {
          const tt = costs.byTier[t] ?? { usd: 0, calls: 0, tokens: 0 };
          return (
            <div key={t} className={`tier-bar tier-${t}`}>
              <span>{TIER_LABEL[t].replace("Nemotron ", "")}</span>
              <div className="bar"><div style={{ width: `${(tt.usd / maxUsd) * 100}%` }} /></div>
              <span className="val">{usd(tt.usd)} · {tt.calls} call{tt.calls === 1 ? "" : "s"}</span>
            </div>
          );
        })}
      </div>
      {costs.allUltraUsd != null && costs.allUltraUsd > costs.totalUsd && <Routing actual={costs.totalUsd} allUltra={costs.allUltraUsd} />}
    </Card>
  );
}

/** Every model call in the run, including rejected attempts that were retried. */
export function CallsTable({ costs }: { costs: CostSummary }) {
  return (
    <Card title="Every model call" sub={`${costs.calls.length} calls, retries included`} flush>
      <div className="table-wrap">
        <table className="table num">
          <thead>
            <tr><th>Agent</th><th>Model</th><th>Tokens in / out</th><th>Latency</th><th>Cost</th></tr>
          </thead>
          <tbody>
            {costs.calls.map((c, i) => (
              <tr key={i}>
                <td>
                  {c.agent}
                  {c.attempt > 1 && <span className="dim"> · retry</span>}
                  {!c.ok && <span className="neg"> · rejected</span>}
                </td>
                <td className={`tier-${c.tier}`}>{c.model}</td>
                <td>{c.promptTokens.toLocaleString()} / {c.completionTokens.toLocaleString()}</td>
                <td>{(c.latencyMs / 1000).toFixed(1)}s</td>
                <td>{usd(c.estimatedCostUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
