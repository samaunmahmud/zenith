import type { AgentModel } from "../types";
import { TierBadge } from "./common";

/** Makes the Nano / Super / Ultra split visible, with the reason for each choice. */
export function Roster({ agents }: { agents: AgentModel[] }) {
  return (
    <div className="roster">
      {agents.map((a) => (
        <div className={`member tier-${a.tier}-card`} key={a.id}>
          <TierBadge tier={a.tier} />
          <b>{a.label}</b>
          <p>{a.why}</p>
          {a.model && <code>{a.model}</code>}
        </div>
      ))}
    </div>
  );
}
