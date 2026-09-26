import { useMemo, useRef, useState, type MouseEvent } from "react";
import type { Snapshot } from "../types";

type Point = Snapshot["priceHistory"][number];

const W = 600;
const H = 260;
const PAD = 8;

function money(x: number | null, currency: string | null) {
  if (x === null) return "n/a";
  return currency && currency !== "USD" ? `${x.toFixed(2)} ${currency}` : `$${x.toFixed(2)}`;
}

/** 1-year price chart with SMA50/SMA200 (all values computed by the backend) and a hover readout. */
export function PriceChart({ points, currency }: { points: Point[]; currency: string | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

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
    return { x, y, close: path("close"), sma50: path("sma50"), sma200: path("sma200") };
  }, [points]);

  if (points.length < 2) return null;
  const up = points[points.length - 1].close >= points[0].close;
  const colour = up ? "var(--bull)" : "var(--bear)";

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = ref.current!.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    setHover(Math.round(ratio * (points.length - 1)));
  };

  const hp = hover !== null ? points[hover] : null;

  return (
    <div className="chart">
      <div className="legend">
        <span><i style={{ background: colour }} />Close</span>
        <span><i style={{ background: "#ffffff" }} />SMA50</span>
        <span><i style={{ background: "var(--dim)" }} />SMA200</span>
      </div>
      <div ref={ref} onMouseMove={onMove} onMouseLeave={() => setHover(null)} style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`1-year price chart, ${up ? "up" : "down"} over the period`}>
          <defs>
            <linearGradient id="fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={up ? "#76b900" : "#ff5c5c"} stopOpacity="0.28" />
              <stop offset="100%" stopColor={up ? "#76b900" : "#ff5c5c"} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="#2a2a2a" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={`${geo.close} L${W},${H} L0,${H} Z`} fill="url(#fill)" />
          <path d={geo.sma200} fill="none" stroke="#6b6b6b" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          <path d={geo.sma50} fill="none" stroke="#ffffff" strokeWidth="1.2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          <path d={geo.close} fill="none" stroke={colour} strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {hover !== null && (
            <line x1={geo.x(hover)} x2={geo.x(hover)} y1="0" y2={H} stroke="#a3a3a3" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {hp && (
          <div className="tip num" style={{ left: `${(hover! / (points.length - 1)) * 100}%`, top: 8 }}>
            <div className="dim">{hp.date}</div>
            <div><b>{money(hp.close, currency)}</b></div>
            <div className="muted">SMA50 {money(hp.sma50, currency)}</div>
            <div className="muted">SMA200 {money(hp.sma200, currency)}</div>
          </div>
        )}
      </div>
      <div className="axis num">
        <span>{points[0].date}</span>
        <span>{points[points.length - 1].date}</span>
      </div>
    </div>
  );
}
