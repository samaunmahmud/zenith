// "LLMs interpret, code calculates": every number an agent writes must trace back to its input.
// This module finds numbers in agent output that don't appear (allowing for rounding) in the input.

// Things that look like numbers but are really names or dates: strip before checking.
const NOISE: RegExp[] = [
  /\b\d{4}-\d{2}-\d{2}\b/g, // ISO dates
  /\b(?:SMA|EMA)\s?\d+\b/gi, // SMA200, EMA 50
  /\bRSI\s?\(?\d+\)?/gi, // RSI (14)
  /\bMACD\s?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)/gi, // MACD(12,26,9)
  /\b\d+[-\s](?:day|week|month|year|quarter|session)s?\b/gi, // 52-week, 3 months
  /\b\d+\s?[dwmy]\b/gi, // 20d, 1y
  /\bS&P\s?500\b/gi,
  /\bQ[1-4]\b/g, // Q3
  /\b(?:19|20)\d{2}\b/g, // years
];

const NUMBER = /-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/g;

export interface ParsedNumber {
  value: number;
  decimals: number;
  raw: string;
}

export function extractNumbers(text: string): ParsedNumber[] {
  let cleaned = text;
  for (const re of NOISE) cleaned = cleaned.replace(re, " ");
  return (cleaned.match(NUMBER) ?? []).map((raw) => {
    const plain = raw.replace(/,/g, "");
    const dot = plain.indexOf(".");
    return { value: Math.abs(Number(plain)), decimals: dot === -1 ? 0 : plain.length - dot - 1, raw };
  });
}

/** Every number present in the input, as absolute values (signs are often dropped in prose). */
export function allowedNumbers(inputs: string[]): number[] {
  return inputs.flatMap((s) => extractNumbers(s).map((n) => n.value));
}

/**
 * A number is supported if some input number rounds to it at the precision the agent used,
 * e.g. "23%" is supported by an input of "23.4%", but "25%" is not.
 */
export function isSupported(n: ParsedNumber, allowed: number[]): boolean {
  const tolerance = 0.5 * 10 ** -n.decimals + 1e-9;
  return allowed.some((a) => Math.abs(a - n.value) <= tolerance);
}

/** Numbers in `text` that don't trace back to the input. Small integers (counts, list items) are ignored. */
export function unsupportedNumbers(text: string, allowed: number[], ignoreSmallIntegers = true): string[] {
  return extractNumbers(text)
    .filter((n) => !(ignoreSmallIntegers && n.decimals === 0 && n.value <= 10))
    .filter((n) => !isSupported(n, allowed))
    .map((n) => n.raw);
}
