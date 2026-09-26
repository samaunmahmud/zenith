import type { CostSummary, Tier } from "../types";
import { TIER_LABEL, usd } from "./common";

const TIERS: Tier[] = ["nano", "super", "ultra"];

/** The "committee cost" readout: what this decision cost, split by Nemotron model. */
export function CostPanel({ costs }: { costs: CostSummary }) {
  const maxUsd = Math.max(...TIERS.map((t) => costs.byTier[t].usd), 1e-9);
  const slowest = Math.max(...costs.calls.map((c) => c.latencyMs), 0);
  return (
    <div className="panel">
      <div className="label">Committee cost</div>
      <div className="cost-grid num">
        <div>
          <b>{usd(costs.totalUsd)}</b>
          <span className="small muted">for this decision</span>
        </div>
        <div>
          <b>{(costs.totalPromptTokens + costs.totalCompletionTokens).toLocaleString()}</b>
          <span className="small muted">tokens · {costs.calls.length} calls</span>
        </div>
        <div>
          <b>{(slowest / 1000).toFixed(1)}s</b>
          <span className="small muted">slowest call</span>
        </div>
      </div>

      <div className="tier-bars num">
        {TIERS.map((t) => (
          <div key={t} className={`tier-bar tier-${t}`}>
            <span>{TIER_LABEL[t].replace("Nemotron ", "").toUpperCase()}</span>
            <div className="track">
              <div className="fill" style={{ width: `${(costs.byTier[t].usd / maxUsd) * 100}%` }} />
            </div>
            <span className="val">
              {usd(costs.byTier[t].usd)} · {costs.byTier[t].calls} call{costs.byTier[t].calls === 1 ? "" : "s"}
            </span>
          </div>
        ))}
      </div>

      <details>
        <summary className="label" style={{ color: "var(--green)" }}>Every model call</summary>
        <div className="table-wrap">
          <table className="calls num">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Model</th>
                <th>Tokens in / out</th>
                <th>Latency</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {costs.calls.map((c, i) => (
                <tr key={i}>
                  <td>
                    {c.agent}
                    {c.attempt > 1 && <span className="muted"> (retry)</span>}
                    {!c.ok && <span style={{ color: "var(--bear)" }}> ✗ rejected</span>}
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
      </details>
    </div>
  );
}
