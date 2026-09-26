import type { ReactNode } from "react";

/** The one panel style used across the workspace: optional header with a title, a subtitle and actions. */
export function Card({ title, sub, actions, children, className = "", flush = false }: {
  title?: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <div className="row" style={{ gap: 10 }}>
            {title && <h2>{title}</h2>}
            {sub && <span className="sub">{sub}</span>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </header>
      )}
      <div className={`card-body ${flush ? "flush" : ""}`}>{children}</div>
    </section>
  );
}
