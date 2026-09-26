import type { Snapshot } from "../../types";
import { compactMoney, pct } from "../../lib/format";
import { Card } from "../ui/Card";

/** The headline numbers, as computed by the backend (the same strings the analysts were given). */
export function KeyStats({ snapshot }: { snapshot: Snapshot }) {
  const t = snapshot.facts.technicals;
  const f = snapshot.facts.fundamentals;
  const rows: [string, string, string?][] = [
    ["Last close", t["Last close"] ?? "n/a"],
    ["1-year return", pct(snapshot.technicals.return1y, true), tone(snapshot.technicals.return1y)],
    ["1-month return", pct(snapshot.technicals.return1m, true), tone(snapshot.technicals.return1m)],
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
            <dt>{k}</dt>
            <dd className={`num ${cls ?? ""}`}>{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

const tone = (x: number | null) => (x === null ? undefined : x >= 0 ? "pos" : "neg");
