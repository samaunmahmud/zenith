import { useCallback, useEffect, useState } from "react";

/** Pause before each kind of statement is read into the minutes: the chair's ruling gets a beat of suspense. */
export const REVEAL_MS = { first: 350, statement: 1300, ruling: 1900 };

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * How many of `total` minuted statements are on screen. They are read out one at a time, so a saved decision
 * (which arrives all at once) plays like the meeting it records, and a live run's statements never pile up.
 * `session` identifies the run: a new one starts again from zero. `isRuling(i)` marks the chair's entry.
 */
export function useReveal(total: number, session: unknown, isRuling: (i: number) => boolean) {
  const [shown, setShown] = useState(0);

  useEffect(() => setShown(0), [session]);

  useEffect(() => {
    if (shown >= total) return;
    if (reducedMotion()) {
      setShown(total);
      return;
    }
    const wait = shown === 0 ? REVEAL_MS.first : isRuling(shown) ? REVEAL_MS.ruling : REVEAL_MS.statement;
    const id = window.setTimeout(() => setShown((n) => Math.min(n + 1, total)), wait);
    return () => window.clearTimeout(id);
  }, [shown, total, isRuling]);

  const skip = useCallback(() => setShown(total), [total]);
  return { shown: Math.min(shown, total), skip, pending: shown < total };
}
