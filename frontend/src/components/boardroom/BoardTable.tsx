import type { AgentModel, ChairDecision, Tier } from "../../types";
import type { Entry, Seat, SeatState } from "../../lib/minutes";
import { ANALYST_TITLE } from "../../lib/format";

/** Where each seat sits around the table, in % of the stage. The chair heads it; the clerk (Java) sits at the foot. */
const PLACES: Record<Seat, { x: number; y: number }> = {
  chair: { x: 50, y: 9 },
  fundamentals: { x: 17, y: 31 },
  technicals: { x: 83, y: 31 },
  news: { x: 17, y: 71 },
  risk: { x: 83, y: 71 },
  clerk: { x: 50, y: 92 },
};
const ORDER: Seat[] = ["chair", "fundamentals", "technicals", "news", "risk", "clerk"];

const NAME: Record<Seat, string> = {
  chair: "The Chair",
  fundamentals: ANALYST_TITLE.fundamentals,
  technicals: ANALYST_TITLE.technicals,
  risk: ANALYST_TITLE.risk,
  news: "News desk",
  clerk: "The Clerk",
};

const TIER_SHORT: Record<Tier, string> = { nano: "Nano", super: "Super", ultra: "Ultra" };

/** "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B" → "Nemotron Nano 30B". */
export function modelName(model: string | null | undefined): string | null {
  if (!model) return null;
  const tail = model.split("/").pop() ?? model;
  const m = /nemotron-?(\d+)?-?(nano|super|ultra)-?(\d+b)?/i.exec(tail);
  if (!m) return tail;
  return ["Nemotron", m[2][0].toUpperCase() + m[2].slice(1).toLowerCase(), m[3]?.toUpperCase()].filter(Boolean).join(" ");
}

/** The one line under a seat's name: what it has said so far, or what it is doing. */
function statusLine(seat: Seat, state: SeatState, said: Entry | undefined): { text: string; tone?: string } {
  if (state === "failed") return { text: "No valid answer", tone: "neg" };
  if (said?.kind === "clerk") return { text: `${Object.values(said.figures).reduce((a, b) => a + b, 0)} figures computed` };
  if (said?.kind === "news") return { text: said.digest ? `${said.digest.sentiment} news` : "No headlines", tone: said.digest ? `sent-${said.digest.sentiment}` : undefined };
  if (said?.kind === "report") return { text: `${said.report.stance} · ${Math.round(said.report.confidence * 100)}%`, tone: `stance-${said.report.stance}` };
  if (said?.kind === "ruling") return { text: `${said.decision.recommendation} · ${Math.round(said.decision.confidence * 100)}%`, tone: `call-${said.decision.recommendation}` };
  if (state === "thinking") return { text: seat === "clerk" ? "Calculating" : seat === "chair" ? "Deliberating" : "Thinking" };
  if (state === "waiting") return { text: "Waiting" };
  return { text: seat === "clerk" ? "Deterministic" : "Ready" };
}

interface SeatProps {
  seat: Seat;
  state: SeatState;
  agent: AgentModel | undefined;
  said: Entry | undefined;
}

function SeatCard({ seat, state, agent, said }: SeatProps) {
  const { text, tone } = statusLine(seat, state, said);
  const place = PLACES[seat];
  const model = seat === "clerk" ? "No model · $0" : modelName(agent?.model) ?? (agent ? `Nemotron ${TIER_SHORT[agent.tier]}` : "");
  return (
    <div
      className={`bseat bseat-${state} id-${seat} ${agent ? `btier-${agent.tier}` : "btier-code"}`}
      style={{ left: `${place.x}%`, top: `${place.y}%` }}
      aria-label={`${NAME[seat]}: ${text}`}
    >
      <div className="bseat-avatar" aria-hidden="true">
        <span>{seat === "clerk" ? "</>" : agent ? TIER_SHORT[agent.tier][0] : "·"}</span>
      </div>
      <div className="bseat-body">
        <b>{NAME[seat]}</b>
        <span className="bseat-model">{model}</span>
        <span className={`bseat-status ${tone ?? ""}`}>
          {state === "thinking" && <i className="typing" aria-hidden="true"><i /><i /><i /></i>}
          {text}
        </span>
      </div>
    </div>
  );
}

function Stamp({ decision }: { decision: ChairDecision }) {
  return (
    <div className={`stamp call-${decision.recommendation}`} role="status">
      <span className="stamp-call">{decision.recommendation}</span>
      <span className="stamp-meta num">{Math.round(decision.confidence * 100)}% confidence · {decision.timeHorizon}</span>
    </div>
  );
}

interface Props {
  agents: AgentModel[];
  states: Record<Seat, SeatState>;
  /** The latest thing each seat has said (revealed entries only). */
  said: Partial<Record<Seat, Entry>>;
  /** What the table centre shows before the ruling: who has the floor and a line of what they said. */
  caption: { title: string; line?: string } | null;
  decision: ChairDecision | null;
  preview?: boolean;
}

/**
 * The boardroom: six seats around one table. The Clerk is plain Java (every number is computed there, at no
 * cost); the other five are Nemotron models, sized to the job. Lines light up when a seat has the floor, and
 * the chair's ruling lands on the table as a stamp.
 */
export function BoardTable({ agents, states, said, caption, decision, preview = false }: Props) {
  const byId = (id: Seat) => agents.find((a) => a.id === id);
  return (
    <div className={`board ${preview ? "board-preview" : ""}`}>
      <svg className="board-wires" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {ORDER.map((seat) => (
          <line key={seat} x1={PLACES[seat].x} y1={PLACES[seat].y} x2={50} y2={50} className={`wire-${states[seat]} id-${seat}`} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="board-table" aria-live="polite">
        {decision ? (
          <Stamp decision={decision} />
        ) : caption ? (
          <div className="board-caption">
            <span className="label">{caption.title}</span>
            {caption.line && <p>{caption.line}</p>}
          </div>
        ) : null}
      </div>
      {ORDER.map((seat) => (
        <SeatCard key={seat} seat={seat} state={states[seat]} agent={seat === "clerk" ? undefined : byId(seat)} said={said[seat]} />
      ))}
    </div>
  );
}
