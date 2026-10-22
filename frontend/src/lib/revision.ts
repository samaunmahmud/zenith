import type { Rebuttal, Stance } from "../types";

/** Where an analyst stood after the rebuttal round. Null for rebuttals saved before positions were measured. */
export function afterRebuttal(rb: Rebuttal | undefined): { stance: Stance; confidence: number } | null {
  return rb?.stanceAfter && rb.confidenceAfter != null ? { stance: rb.stanceAfter, confidence: rb.confidenceAfter } : null;
}

/** "bullish → neutral" for a measured change, "revised" for an older session's self-reported one, else null. */
export function shiftLabel(rb: Rebuttal | undefined): string | null {
  if (!rb?.stanceChanged) return null;
  return rb.stanceBefore && rb.stanceAfter ? `${rb.stanceBefore} → ${rb.stanceAfter}` : "revised";
}

/** The tooltip on a change marker: measured in code, or only the model's word for it on older sessions. */
export function shiftTitle(rb: Rebuttal): string {
  return rb.stanceBefore && rb.stanceAfter
    ? `Changed position after the rebuttal round: ${rb.stanceBefore} ${pctOf(rb.confidenceBefore)} in its report, ${rb.stanceAfter} ${pctOf(rb.confidenceAfter)} afterwards. Compared in code.`
    : "Changed position after the rebuttal round, as the analyst reported it (saved before positions were compared in code)";
}

const pctOf = (x: number | undefined) => (x == null ? "" : `${Math.round(x * 100)}%`);
