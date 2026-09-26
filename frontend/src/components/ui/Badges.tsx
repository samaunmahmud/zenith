import type { ChairDecision, Stance, Tier } from "../../types";
import { TIER_LABEL } from "../../lib/format";

export function TierBadge({ tier }: { tier: Tier }) {
  return <span className={`badge tier-${tier}`}>{TIER_LABEL[tier]}</span>;
}

export function StanceBadge({ stance }: { stance: Stance }) {
  return <span className={`badge ${stance}`}>{stance[0].toUpperCase() + stance.slice(1)}</span>;
}

export function VerdictChip({ decision }: { decision: ChairDecision }) {
  return (
    <span className={`verdict-chip ${decision.recommendation}`}>
      {decision.recommendation} <span>{Math.round(decision.confidence * 100)}%</span>
    </span>
  );
}

export function ConfidenceBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className={className} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`Confidence ${pct}%`}>
      <div className="confidence">
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
