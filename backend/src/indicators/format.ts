// Formatting helpers. Numbers are formatted ONCE, here, and agents copy the strings verbatim.

export const NA = "not available";

export function pct(x: number | null, { signed = false, digits = 1 } = {}): string {
  if (x === null) return NA;
  const s = (x * 100).toFixed(digits);
  return `${signed && x > 0 ? "+" : ""}${s}%`;
}

export function fixed(x: number | null, digits = 2): string {
  return x === null ? NA : x.toFixed(digits);
}

export function compact(x: number | null): string {
  if (x === null) return NA;
  const abs = Math.abs(x);
  if (abs >= 1e12) return `${(x / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(x / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(x / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(x / 1e3).toFixed(1)}K`;
  return x.toFixed(0);
}

export function money(x: number | null, currency: string | null, big = false): string {
  if (x === null) return NA;
  const body = big ? compact(x) : x.toFixed(2);
  return currency && currency !== "USD" ? `${body} ${currency}` : `$${body}`;
}
