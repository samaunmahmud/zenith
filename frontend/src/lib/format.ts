import type { AnalystName, Tier } from "../types";

export const ANALYSTS: AnalystName[] = ["fundamentals", "technicals", "risk"];
export const ANALYST_TITLE: Record<AnalystName, string> = { fundamentals: "Fundamentals", technicals: "Technicals", risk: "Risk" };
export const TIER_LABEL: Record<Tier, string> = { nano: "Nemotron Nano", super: "Nemotron Super", ultra: "Nemotron Ultra" };

const finite = (x: number | null | undefined): x is number => x !== null && x !== undefined && Number.isFinite(x);

/** Rounds to the displayed precision first, so the sign (and colour) always matches what is shown: never "+0.0%". */
export const roundPct = (x: number) => Math.round(x * 1000) / 1000;

export const pct = (x: number | null | undefined, signed = false) => {
  if (!finite(x)) return "n/a";
  const r = roundPct(x) || 0; // "|| 0" turns -0 into 0
  return `${signed && r > 0 ? "+" : ""}${(r * 100).toFixed(1)}%`;
};

/** Green for a displayed gain, red for a displayed loss, nothing for zero or missing. */
export const toneOf = (x: number | null | undefined) => (!finite(x) || roundPct(x) === 0 ? undefined : x > 0 ? "pos" : "neg");

export const usd = (x: number) => (!finite(x) ? "n/a" : x < 0.01 ? `$${x.toFixed(4)}` : `$${x.toFixed(3)}`);

export function money(x: number | null | undefined, currency: string | null) {
  if (!finite(x)) return "n/a";
  if (currency && currency !== "USD") return `${x.toFixed(2)} ${currency}`;
  return `${x < 0 ? "-" : ""}$${Math.abs(x).toFixed(2)}`;
}

/** $412.0B, $8.9M: for market caps and volumes. The unit is chosen after rounding, so 999.96M reads $1.0B. */
export function compactMoney(x: number | null | undefined) {
  if (!finite(x)) return "n/a";
  const sign = x < 0 ? "-" : "";
  const abs = Math.abs(x);
  const units: [number, string][] = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [size, unit] of units) if (Number((abs / size).toFixed(1)) >= 1) return `${sign}$${(abs / size).toFixed(1)}${unit}`;
  return `${sign}$${abs.toFixed(0)}`;
}

export const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

export const shortDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** "3h ago", "2d ago": for headlines. */
export function ago(iso: string, now = Date.now()) {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (!Number.isFinite(mins)) return "";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 48) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

/** Only http(s) links from third-party data (news feeds) are rendered as links; anything else (javascript:, data:) is not. */
export function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/** "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B" → "Nemotron Nano 30B". */
export function modelName(model: string | null | undefined): string | null {
  if (!model) return null;
  const tail = model.split("/").pop() ?? model;
  const m = /nemotron-?(\d+)?-?(nano|super|ultra)-?(\d+b)?/i.exec(tail);
  if (!m) return tail;
  return ["Nemotron", m[2][0].toUpperCase() + m[2].slice(1).toLowerCase(), m[3]?.toUpperCase()].filter(Boolean).join(" ");
}
