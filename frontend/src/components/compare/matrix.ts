import type { CommitteeState } from "../../state/committee";

/** Which way is better for a row, or none when "better" depends on the investor (e.g. price, market cap). */
export type Better = "higher" | "lower" | null;

export interface Row {
  label: string;
  /** Glossary key, when the row is a metric with a definition. */
  term?: string;
  a: string;
  b: string;
  better: Better;
  /** Which side the row favours, when it has a direction and both values parse. */
  edge: "a" | "b" | null;
}

const CALL_RANK = { BUY: 2, HOLD: 1, SELL: 0 } as const;

/** "38.93", "+65.5%", "$25.74B", "-20.2%" → a number, or null for "n/a" and the like. */
export function toNumber(v: string | undefined): number | null {
  if (!v) return null;
  const m = v.replace(/,/g, "").replace(/−/g, "-").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

export function edgeOf(a: string, b: string, better: Better): "a" | "b" | null {
  if (!better) return null;
  const x = toNumber(a);
  const y = toNumber(b);
  if (x === null || y === null || x === y) return null;
  return (better === "higher" ? x > y : x < y) ? "a" : "b";
}

type Section = "fundamentals" | "technicals" | "risk";
const FACT_ROWS: [Section, string, Better][] = [
  ["fundamentals", "P/E (TTM)", "lower"],
  ["fundamentals", "PEG ratio (TTM)", "lower"],
  ["fundamentals", "EV/EBITDA (TTM)", "lower"],
  ["fundamentals", "Revenue growth (last fiscal year)", "higher"],
  ["fundamentals", "Net margin (TTM)", "higher"],
  ["fundamentals", "Return on equity (TTM)", "higher"],
  ["fundamentals", "Debt/Equity (TTM)", "lower"],
  ["technicals", "1-year return", "higher"],
  ["technicals", "Price vs SMA200", "higher"],
  ["technicals", "RSI (14)", null],
  ["risk", "Annualised volatility (1y)", "lower"],
  ["risk", "Beta vs S&P 500 (SPY, 1y daily)", "lower"],
  ["risk", "Max drawdown (1y)", "higher"], // −10% is a smaller fall than −30%
];

/** The metric rows of the matrix, straight from the fact sheets both committees were given. */
export function metricRows(a: CommitteeState, b: CommitteeState): Row[] {
  const fact = (s: CommitteeState, sec: Section, key: string) => s.snapshot?.facts[sec]?.[key] ?? "n/a";
  return FACT_ROWS.map(([sec, key, better]) => {
    const x = fact(a, sec, key);
    const y = fact(b, sec, key);
    return { label: key, term: key, a: x, b: y, better, edge: edgeOf(x, y, better) };
  });
}

/**
 * The committees' own preference, decided in code: the stronger call wins (BUY over HOLD over SELL), then the
 * chair's confidence. Returns null when there's nothing to choose between.
 */
export function preferred(a: CommitteeState, b: CommitteeState): "a" | "b" | null {
  if (!a.decision || !b.decision) return null;
  const ra = CALL_RANK[a.decision.recommendation];
  const rb = CALL_RANK[b.decision.recommendation];
  if (ra !== rb) return ra > rb ? "a" : "b";
  if (Math.abs(a.decision.confidence - b.decision.confidence) < 0.005) return null;
  // Same call: for BUY/HOLD more conviction is the stronger case; for SELL, less conviction to sell is.
  const higher = a.decision.confidence > b.decision.confidence ? "a" : "b";
  return a.decision.recommendation === "SELL" ? (higher === "a" ? "b" : "a") : higher;
}
