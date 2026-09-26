import { useId } from "react";
import { define } from "../../lib/glossary";

/**
 * A metric name with its plain-English definition on hover or keyboard focus.
 * Labels the glossary doesn't know render as plain text.
 */
export function Term({ label }: { label: string }) {
  const id = useId();
  const definition = define(label);
  if (!definition) return <>{label}</>;
  return (
    <span className="term" tabIndex={0} aria-describedby={id}>
      {label}
      <span className="term-tip" role="tooltip" id={id}>{definition}</span>
    </span>
  );
}
