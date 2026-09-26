import type { NewsDigest, Snapshot, SourceInfo } from "../types";
import { pct } from "./common";

function Sparkline({ points }: { points: { date: string; close: number }[] }) {
  if (points.length < 2) return null;
  const w = 400;
  const h = 110;
  const closes = points.map((p) => p.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const x = (i: number) => (i / (points.length - 1)) * w;
  const y = (c: number) => h - 6 - ((c - min) / (max - min || 1)) * (h - 12);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.close).toFixed(1)}`).join(" ");
  const up = closes[closes.length - 1] >= closes[0];
  const colour = up ? "var(--bull)" : "var(--bear)";
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`1-year price chart, ${up ? "up" : "down"}`}>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={colour} opacity={0.12} />
      <path d={line} fill="none" stroke={colour} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function SnapshotBar({ snapshot, sources, digest }: { snapshot: Snapshot; sources: SourceInfo[]; digest: NewsDigest | null | undefined }) {
  const t = snapshot.facts.technicals;
  const stale = sources.some((s) => s.stale);
  return (
    <div className="panel snapshot">
      <div>
        <div className="title">
          {snapshot.ticker} <span className="muted">· {snapshot.companyName}</span>
        </div>
        <div className="muted small">
          {[snapshot.sector, snapshot.industry].filter(Boolean).join(" / ")} · data as of {snapshot.asOf}
          {stale && " · ⚠ some data served from an older cache"}
        </div>
        <div className="stats num">
          <div className="stat"><span>Last close</span><b>{t["Last close"]}</b></div>
          <div className="stat"><span>1-year return</span><b>{pct(snapshot.technicals.return1y, true)}</b></div>
          <div className="stat"><span>RSI (14)</span><b>{t["RSI (14)"]}</b></div>
          <div className="stat"><span>Volatility (1y)</span><b>{pct(snapshot.risk.volatility1y)}</b></div>
          <div className="stat"><span>Beta vs SPY</span><b>{snapshot.risk.betaVsSpy?.toFixed(2) ?? "n/a"}</b></div>
          <div className="stat"><span>P/E (TTM)</span><b>{snapshot.facts.fundamentals["P/E (TTM)"]}</b></div>
        </div>
        {digest && digest.sentiment !== "none" && (
          <div className="small" style={{ marginTop: 10 }}>
            <span className="muted">News desk ({digest.sentiment}): </span>
            {digest.themes.join(" · ")}
          </div>
        )}
      </div>
      <Sparkline points={snapshot.priceHistory} />
    </div>
  );
}
