import type { AnalystName, Tier } from "../types";

export const ANALYSTS: AnalystName[] = ["fundamentals", "technicals", "risk"];
export const ANALYST_TITLE: Record<AnalystName, string> = { fundamentals: "Fundamentals", technicals: "Technicals", risk: "Risk" };
export const TIER_LABEL: Record<Tier, string> = { nano: "Nemotron Nano", super: "Nemotron Super", ultra: "Nemotron Ultra" };

export const pct = (x: number | null | undefined, signed = false) =>
  x === null || x === undefined || !Number.isFinite(x) ? "n/a" : `${signed && x > 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

export const usd = (x: number) => (x < 0.01 ? `$${x.toFixed(4)}` : `$${x.toFixed(3)}`);

export function money(x: number | null | undefined, currency: string | null) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "n/a";
  return currency && currency !== "USD" ? `${x.toFixed(2)} ${currency}` : `$${x.toFixed(2)}`;
}

/** $412.0B, $8.9M: for market caps and volumes. */
export function compactMoney(x: number | null | undefined) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "n/a";
  const units: [number, string][] = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [size, unit] of units) if (Math.abs(x) >= size) return `$${(x / size).toFixed(1)}${unit}`;
  return `$${x.toFixed(0)}`;
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
