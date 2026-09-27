/** The chair tags each rationale line with the analyst(s) it draws on: "[Fundamentals + Risk] Both flag valuation." */
export function splitSource(text: string): { source: string | null; body: string } {
  const m = /^\[([^\]]{1,40})\]\s*(.*)$/s.exec(text);
  return m ? { source: m[1], body: m[2] } : { source: null, body: text };
}

/** The first analyst a source tag names, for its identity colour. */
export const firstAnalyst = (source: string | null) => source?.match(/fundamentals|technicals|risk/i)?.[0].toLowerCase() ?? null;
