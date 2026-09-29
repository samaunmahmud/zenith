import type { TapeRow } from "../../types";
import { pct, shortDate, toneOf } from "../../lib/format";

/** A 30-day closing-price line, coloured by which way it went. */
export function Sparkline({ values, width = 72, height = 20 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const span = Math.max(...values) - lo || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 1 - ((v - lo) / span) * (height - 2)).toFixed(1)}`);
  const tone = values.at(-1)! >= values[0] ? "pos" : "neg";
  return (
    <svg className={`spark ${tone}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={pts.join(" ")} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

// React 18 doesn't know `inert` yet; an empty string sets the attribute.
const INERT = { inert: "" } as object;

function Item({ r, onOpen }: { r: TapeRow; onOpen: (ticker: string) => void }) {
  return (
    <button type="button" className="tape-item" onClick={() => onOpen(r.ticker)} title={`${r.company}: close on ${r.asOf}. Open its committee session`}>
      <b>{r.ticker}</b>
      <span className="num">{r.close.toFixed(2)}</span>
      <span className={`num ${toneOf(r.change) ?? ""}`}>{r.change === null ? "" : `${r.change >= 0 ? "▲" : "▼"} ${pct(Math.abs(r.change))}`}</span>
      {r.lastCall && <span className={`tape-call call-${r.lastCall.call}`}>{r.lastCall.call}</span>}
    </button>
  );
}

/**
 * The ticker tape across the top of the landing page. It scrolls like a live tape but says plainly what it is:
 * the last recorded close for each stock on file, dated. Prices here are never presented as live.
 */
export function Tape({ rows, onOpen }: { rows: TapeRow[]; onOpen: (ticker: string) => void }) {
  if (rows.length === 0) return null;
  const latest = rows.map((r) => r.asOf).sort().at(-1)!;
  return (
    <div className="tape" role="region" aria-label="Stocks on file">
      <span className="tape-lbl">Last close · {shortDate(latest)}</span>
      <div className="tape-view">
        {/* Two copies, so the loop is seamless; the second is hidden from screen readers and the tab order. */}
        <div className="tape-track" style={{ animationDuration: `${Math.max(24, rows.length * 6)}s` }}>
          <div className="tape-set">{rows.map((r) => <Item key={r.ticker} r={r} onOpen={onOpen} />)}</div>
          <div className="tape-set" aria-hidden="true" {...INERT}>{rows.map((r) => <Item key={r.ticker} r={r} onOpen={onOpen} />)}</div>
        </div>
      </div>
    </div>
  );
}
