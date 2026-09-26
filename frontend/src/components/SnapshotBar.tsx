import type { NewsDigest, Snapshot, SourceInfo } from "../types";
import { pct } from "./common";
import { PriceChart } from "./PriceChart";

export function SnapshotBar({ snapshot, sources, digest }: { snapshot: Snapshot; sources: SourceInfo[]; digest: NewsDigest | null | undefined }) {
  const t = snapshot.facts.technicals;
  const r1y = snapshot.technicals.return1y;
  const stale = sources.some((s) => s.stale);
  return (
    <div className="snapshot">
      <div>
        <div className="ticker-title">
          <b>{snapshot.ticker}</b>
          <span>{snapshot.companyName}</span>
        </div>
        <div className="small dim">
          {[snapshot.sector, snapshot.industry].filter(Boolean).join(" · ")}
        </div>
        <div className="price-line num">
          <b>{t["Last close"]}</b>
          <span className={r1y !== null && r1y < 0 ? "stance-bearish" : "stance-bullish"} style={{ fontWeight: 800 }}>
            {pct(r1y, true)} <span className="dim small">1Y</span>
          </span>
        </div>
        <div className="small dim">
          Close on {snapshot.asOf}
          {stale && " · ⚠ some data from an older cache"}
        </div>
        <div className="stats num">
          <div className="stat"><span>RSI (14)</span><b>{t["RSI (14)"]}</b></div>
          <div className="stat"><span>1M return</span><b>{t["1-month return"]}</b></div>
          <div className="stat"><span>vs SMA200</span><b>{t["Price vs SMA200"]}</b></div>
          <div className="stat"><span>Volatility 1Y</span><b>{pct(snapshot.risk.volatility1y)}</b></div>
          <div className="stat"><span>Beta vs SPY</span><b>{snapshot.risk.betaVsSpy?.toFixed(2) ?? "n/a"}</b></div>
          <div className="stat"><span>P/E (TTM)</span><b>{snapshot.facts.fundamentals["P/E (TTM)"]}</b></div>
        </div>
        {digest && digest.sentiment !== "none" && (
          <div className="news-line">
            <span className="label">News desk · {digest.sentiment}</span>
            <div>{digest.themes.join(" · ")}</div>
          </div>
        )}
      </div>
      <div>
        <PriceChart points={snapshot.priceHistory} currency={snapshot.currency} />
      </div>
    </div>
  );
}
