import type { Tier } from "../types";

export const TIER_LABEL: Record<Tier, string> = { nano: "Nemotron Nano", super: "Nemotron Super", ultra: "Nemotron Ultra" };

export function TierBadge({ tier }: { tier: Tier }) {
  return <span className={`badge tier-${tier}`}>{TIER_LABEL[tier]}</span>;
}

export const pct = (x: number | null | undefined, signed = false) =>
  x === null || x === undefined ? "n/a" : `${signed && x > 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

export const usd = (x: number) => (x < 0.01 ? `$${x.toFixed(4)}` : `$${x.toFixed(3)}`);

export function ConfidenceBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={className} title={`Confidence ${Math.round(value * 100)}%`}>
      <div className="confidence">
        <div style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}
