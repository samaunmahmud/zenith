import type { ReactNode } from "react";

interface Props {
  /** Short function code shown in the title bar, terminal style: "PRC", "LOG", "RUL". */
  code: string;
  title: string;
  meta?: ReactNode;
  className?: string;
  children: ReactNode;
  /** Panel is waiting on something: dims the body and shows a scan line. */
  idle?: boolean;
  id?: string;
}

/** A terminal panel: a code + title bar, then a dense body. */
export function Panel({ code, title, meta, className = "", children, idle = false, id }: Props) {
  const h = id ? `${id}-h` : undefined;
  return (
    <section className={`tpanel ${idle ? "is-idle" : ""} ${className}`} aria-labelledby={h} id={id}>
      <header className="tpanel-bar">
        <span className="tpanel-code" aria-hidden="true">{code}</span>
        <h2 id={h}>{title}</h2>
        {meta && <div className="tpanel-meta">{meta}</div>}
      </header>
      <div className="tpanel-body">{children}</div>
    </section>
  );
}

/** "T+01:04.3": elapsed time on the session clock. */
export function clock(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  return `T+${String(m).padStart(2, "0")}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
}

/** A tier's badge: NANO / SUPER / ULTRA, or JAVA for the Clerk. */
export function TierTag({ tier }: { tier: string | null }) {
  return <span className={`ttag ttag-${tier ?? "java"}`}>{tier ? tier.toUpperCase() : "JAVA"}</span>;
}
