import { useId, useMemo, useRef, useState, type MouseEvent } from "react";
import type { Snapshot } from "../../types";
import { money, shortDate } from "../../lib/format";

type Point = Snapshot["priceHistory"][number];

const W = 600;
const H = 260;
const PAD = 10;
const RANGES = [
  { id: "1M", bars: 21 },
  { id: "3M", bars: 63 },
  { id: "6M", bars: 126 },
  { id: "1Y", bars: Infinity },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

/** Price chart with SMA50/SMA200 (all values computed by the backend), a range picker and a hover readout. */
export function PriceChart({ points: all, currency }: { points: Point[]; currency: string | null }) {
  const [range, setRange] = useState<RangeId>("1Y");
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const gradientId = `fill-${useId().replace(/:/g, "")}`; // SVG ids are page-global: never share one between charts

  const points = useMemo(() => {
    const bars = RANGES.find((r) => r.id === range)!.bars;
    return Number.isFinite(bars) ? all.slice(-bars) : all;
  }, [all, range]);

  const geo = useMemo(() => {
    const values = points.flatMap((p) => [p.close, p.sma50, p.sma200]).filter((v): v is number => v !== null);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const x = (i: number) => (i / Math.max(points.length - 1, 1)) * W;
    const y = (v: number) => H - PAD - ((v - min) / (max - min || 1)) * (H - PAD * 2);
    const path = (key: "close" | "sma50" | "sma200") => {
      let d = "";
      points.forEach((p, i) => {
        const v = p[key];
        if (v === null) return;
        d += `${d ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      });
      return d;
    };
    const ticks = [0.2, 0.5, 0.8].map((f) => ({ top: (y(min + (max - min) * f) / H) * 100, value: min + (max - min) * f }));
    const dates = [0, 0.33, 0.66, 1].map((f) => Math.round(f * (points.length - 1)));
    return { x, y, ticks, dates, close: path("close"), sma50: path("sma50"), sma200: path("sma200") };
  }, [points]);

  if (all.length < 2) return null;
  const first = points[0].close;
  const lastClose = points[points.length - 1].close;
  const change = lastClose / first - 1;
  const up = change >= 0;
  const colour = up ? "var(--pos)" : "var(--neg)";

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = ref.current!.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    setHover(Math.round(ratio * (points.length - 1)));
  };

  const hp = hover !== null ? points[hover] : null;
  const tipLeft = hover !== null ? Math.min(Math.max((hover / (points.length - 1)) * 100, 12), 88) : 0;

  return (
    <div className="chart">
      <div className="chart-top">
        <div className="legend">
          <span><i style={{ background: colour }} />Close</span>
          <span><i className="dashed" />SMA50</span>
          <span><i style={{ background: "#5d666c" }} />SMA200</span>
        </div>
        <div className="ranges" role="tablist" aria-label="Chart range">
          {RANGES.map((r) => (
            <button
              key={r.id}
              role="tab"
              aria-selected={range === r.id}
              onClick={() => { setRange(r.id); setHover(null); }}
            >
              {r.id}
            </button>
          ))}
        </div>
      </div>
      <div className={`chart-change num ${up ? "pos" : "neg"}`}>
        {up ? "+" : ""}{(change * 100).toFixed(1)}% <span className="dim">over {range === "1Y" ? "the year" : range}</span>
      </div>
      <div className="plot" ref={ref} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${range} price chart, ${up ? "up" : "down"} ${(Math.abs(change) * 100).toFixed(1)}%`}>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={up ? "#3fbf72" : "#f0585d"} stopOpacity="0.22" />
              <stop offset="100%" stopColor={up ? "#3fbf72" : "#f0585d"} stopOpacity="0" />
            </linearGradient>
          </defs>
          {geo.ticks.map((t) => (
            <line key={t.top} x1="0" x2={W} y1={(t.top / 100) * H} y2={(t.top / 100) * H} stroke="#1f2629" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={`${geo.close} L${W},${H} L0,${H} Z`} fill={`url(#${gradientId})`} />
          <path d={geo.sma200} fill="none" stroke="#5d666c" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          <path d={geo.sma50} fill="none" stroke="#d9dee1" strokeWidth="1.1" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          <path d={geo.close} fill="none" stroke={colour} strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {hover !== null && (
            <line x1={geo.x(hover)} x2={geo.x(hover)} y1="0" y2={H} stroke="#818a90" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {geo.ticks.map((t) => (
          <span key={t.top} className="ytick num" style={{ top: `${t.top}%` }}>{money(t.value, currency)}</span>
        ))}
        {hp && (
          <div className="tip num" style={{ left: `${tipLeft}%` }}>
            <div className="dim">{hp.date}</div>
            <div><b>{money(hp.close, currency)}</b></div>
            <div className="muted">SMA50 {money(hp.sma50, currency)}</div>
            <div className="muted">SMA200 {money(hp.sma200, currency)}</div>
          </div>
        )}
      </div>
      <div className="axis num">
        {geo.dates.map((i) => (
          <span key={i}>{shortDate(points[i].date)}</span>
        ))}
      </div>
    </div>
  );
}
