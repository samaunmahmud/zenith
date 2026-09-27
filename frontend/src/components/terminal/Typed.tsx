import { useEffect, useState } from "react";
import { segmentFigures } from "../../lib/minutes";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Types `text` in once, then shows it with its figures marked traced (green) or flagged (red). */
export function Typed({ text, flagged, checked, animate }: { text: string; flagged: string[]; checked: boolean; animate: boolean }) {
  const [n, setN] = useState(animate && !reducedMotion() ? 0 : text.length);
  useEffect(() => {
    if (n >= text.length) return;
    const cps = Math.max(90, text.length / 1.4); // long statements type faster, never more than ~1.4s
    let raf = 0;
    const t0 = performance.now();
    const from = n;
    const tick = (now: number) => {
      const next = Math.min(text.length, from + Math.floor(((now - t0) / 1000) * cps));
      setN(next);
      if (next < text.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  if (n < text.length) return <>{text.slice(0, n)}<span className="caret" aria-hidden="true">▌</span></>;
  return (
    <>
      {segmentFigures(text, flagged, checked).map((s, i) =>
        s.figure ? <mark key={i} className={`fig fig-${s.figure}`} title={s.figure === "flagged" ? "Not found in this agent's fact sheet" : "Traced to the fact sheet"}>{s.text}</mark> : <span key={i}>{s.text}</span>,
      )}
    </>
  );
}
