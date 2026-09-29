/** Figures in prose: which ones the integrity check traced to an agent's input, and which it flagged. */

export type Segment = { text: string; figure?: "flagged" | "traced" };

// A figure as written in prose: optional sign and $, digits with thousands separators, decimals, then %, x or a unit.
// Not inside a word, so "SMA200" and "RSI14" stay text.
const FIGURE = /(?<![A-Za-z\d.])[-+−]?\$?\d{1,3}(?:,\d{3})+(?:\.\d+)?[%xBMKT]?|(?<![A-Za-z\d.])[-+−]?\$?\d+(?:\.\d+)?[%xBMKT]?(?![A-Za-z\d])/g;

// "52-week", "200 days": periods, not data, and skipped by the backend check too. Same for years (2026).
const PERIOD = /^[-‑\s]?(?:day|week|month|year|quarter|session)s?\b/i;

/** The bare number the backend reports for a figure: no sign, $, % or unit ("-$1,234.5%" → "1,234.5"). */
export const bare = (figure: string) => figure.replace(/^[-+−]/, "").replace(/^\$/, "").replace(/[%xBMKT]$/, "");

/**
 * Splits text into plain runs and figures. A figure the integrity check couldn't trace to the agent's input is
 * "flagged". Once the check has run (`checked`), a figure that looks like data (has a decimal, %, $ or thousands
 * separator) and wasn't flagged is "traced"; bare small integers ("3 analysts") are left as text, as the backend
 * doesn't check them either.
 */
export function segmentFigures(text: string, flagged: string[], checked: boolean): Segment[] {
  const flags = new Set(flagged.map(bare));
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(FIGURE)) {
    const raw = m[0];
    const start = m.index ?? 0;
    const core = bare(raw);
    const isFlagged = flags.has(core) || flags.has(`-${core}`);
    const dataLike = /[.,%$]/.test(raw) || (Number(core) > 10 && !/^(19|20)\d\d$/.test(core) && !PERIOD.test(text.slice(start + raw.length)));
    if (!isFlagged && !(checked && dataLike)) continue;
    if (start > last) out.push({ text: text.slice(last, start) });
    out.push({ text: raw, figure: isFlagged ? "flagged" : "traced" });
    last = start + raw.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
