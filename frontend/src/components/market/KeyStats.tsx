import type { Snapshot } from "../../types";
import { compactMoney, money, pct, toneOf } from "../../lib/format";
import { Card } from "../ui/Card";
import { Term } from "../ui/Term";

/** The headline numbers, as computed by the backend (the same strings the analysts were given). */
export function KeyStats({ snapshot }: { snapshot: Snapshot }) {
  const t = snapshot.facts.technicals;
  const f = snapshot.facts.fundamentals;
  const rows: [string, string, string?][] = [
    ["Last close", t["Last close"] ?? "n/a"],
    ["1-year return", pct(snapshot.technicals.return1y, true), toneOf(snapshot.technicals.return1y)],
    ["1-month return", pct(snapshot.technicals.return1m, true), toneOf(snapshot.technicals.return1m)],
    ["Price vs SMA200", t["Price vs SMA200"] ?? "n/a"],
    ["RSI (14)", t["RSI (14)"] ?? "n/a"],
    ["Volatility (1Y)", pct(snapshot.risk.volatility1y)],
    ["Beta vs SPY (1Y)", snapshot.risk.betaVsSpy?.toFixed(2) ?? "n/a"],
    ["P/E (TTM)", f["P/E (TTM)"] ?? "n/a"],
    ["Market cap", compactMoney(snapshot.marketCap)],
  ];
  return (
    <Card title="Key metrics" sub={`as of ${snapshot.asOf}`} flush>
      <dl className="kv">
        {rows.map(([k, v, cls]) => (
          <div key={k}>
            <dt><Term label={k} /></dt>
            <dd className={`num ${cls ?? ""}`}>{v}</dd>
          </div>
        ))}
      </dl>
      <RangeBar snapshot={snapshot} />
    </Card>
  );
}

/** Where today's close sits between the year's lowest and highest close. */
function RangeBar({ snapshot }: { snapshot: Snapshot }) {
  const r = snapshot.technicals.range52w;
  if (!r || !(r.high > r.low)) return null;
  const at = Math.min(1, Math.max(0, (snapshot.lastClose - r.low) / (r.high - r.low)));
  const label = `52-week range: ${money(r.low, snapshot.currency)} to ${money(r.high, snapshot.currency)}; last close ${Math.round(at * 100)}% of the way up`;
  return (
    <div className="range52" role="img" aria-label={label}>
      <div className="range52-head">
        <span><Term label="52-week high" /> and low</span>
        <span className="num dim">{Math.round(at * 100)}% up the range</span>
      </div>
      <div className="range52-track"><i style={{ left: `${at * 100}%` }} /></div>
      <div className="range52-ends num"><span>{money(r.low, snapshot.currency)}</span><span>{money(r.high, snapshot.currency)}</span></div>
    </div>
  );
}
