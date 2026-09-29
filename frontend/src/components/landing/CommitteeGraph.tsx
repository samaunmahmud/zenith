import type { AgentModel } from "../../types";
import { modelName } from "../../lib/format";
import { TierTag } from "../session/Panel";

/** Where each seat sits on the diagram, in % of its box. */
const LAYOUT: Record<string, { x: number; y: number }> = {
  chair: { x: 50, y: 12 },
  fundamentals: { x: 17, y: 50 },
  technicals: { x: 50, y: 50 },
  risk: { x: 83, y: 50 },
  news: { x: 83, y: 88 },
  clerk: { x: 30, y: 88 },
};

const EDGES: [string, string][] = [
  ["clerk", "fundamentals"], ["clerk", "technicals"], ["clerk", "risk"],
  ["news", "fundamentals"], ["news", "technicals"], ["news", "risk"],
  ["fundamentals", "chair"], ["technicals", "chair"], ["risk", "chair"],
];

/**
 * The committee as a diagram, from the live config: which Nemotron model holds each seat, and how figures flow from
 * the Java clerk through the analysts to the chair. The pulses are decoration; the seats and models are real.
 */
export function CommitteeGraph({ agents }: { agents: AgentModel[] }) {
  const seats = [
    { id: "clerk", label: "Clerk", tier: null as AgentModel["tier"] | null, sub: "Java · computes every figure" },
    ...agents.filter((a) => LAYOUT[a.id]).map((a) => ({ id: a.id, label: a.label.replace(/ Analyst$/, "").replace(/^Committee /, ""), tier: a.tier, sub: modelName(a.model) ?? "" })),
  ];
  return (
    <figure className="cgraph" aria-label="How the committee is wired: a Java clerk computes the figures, three Nemotron analysts argue, a Nemotron Ultra chair decides">
      <svg className="cgraph-wires" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {EDGES.filter(([a, b]) => seats.some((s) => s.id === a) && seats.some((s) => s.id === b)).map(([a, b], i) => {
          const p = LAYOUT[a];
          const q = LAYOUT[b];
          const d = `M${p.x} ${p.y} C ${p.x} ${(p.y + q.y) / 2}, ${q.x} ${(p.y + q.y) / 2}, ${q.x} ${q.y}`;
          return (
            <g key={a + b}>
              <path d={d} className="wire-base" vectorEffect="non-scaling-stroke" />
              <path d={d} className={`wire-pulse ${b === "chair" ? "to-chair" : ""}`} vectorEffect="non-scaling-stroke" style={{ animationDelay: `${(i % 3) * 0.45 + (b === "chair" ? 1.2 : 0)}s` }} />
            </g>
          );
        })}
      </svg>
      {seats.map((s) => (
        <div key={s.id} className={`cnode id-${s.id} ${s.id === "chair" ? "is-chair" : ""}`} style={{ left: `${LAYOUT[s.id].x}%`, top: `${LAYOUT[s.id].y}%` }}>
          <div className="cnode-top"><i className="id-mark" aria-hidden="true" /><b>{s.label}</b></div>
          <div className="cnode-sub"><TierTag tier={s.tier} /><span>{s.sub.replace(/^Nemotron /, "")}</span></div>
        </div>
      ))}
    </figure>
  );
}
