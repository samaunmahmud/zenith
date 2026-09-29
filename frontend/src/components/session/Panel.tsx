import type { ReactNode } from "react";

interface Props {
  title: string;
  meta?: ReactNode;
  className?: string;
  children: ReactNode;
  id?: string;
}

/** A card with a title row (and optional meta on the right), then its body. */
export function Panel({ title, meta, className = "", children, id }: Props) {
  const h = id ? `${id}-h` : undefined;
  return (
    <section className={`tpanel ${className}`} aria-labelledby={h} id={id}>
      <header className="tpanel-bar">
        <h2 id={h}>{title}</h2>
        {meta && <div className="tpanel-meta">{meta}</div>}
      </header>
      <div className="tpanel-body">{children}</div>
    </section>
  );
}

/** "0:04.3": elapsed time on the session clock. */
export function clock(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
}

/** A tier's badge: Nano / Super / Ultra, or Java for the Clerk. */
export function TierTag({ tier }: { tier: string | null }) {
  return <span className={`ttag ttag-${tier ?? "java"}`}>{tier ? tier[0].toUpperCase() + tier.slice(1) : "Java"}</span>;
}
