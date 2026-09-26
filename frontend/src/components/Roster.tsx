import type { AgentModel } from "../types";
import { TierBadge } from "./common";

/** "Who's on the committee": makes the Nano / Super / Ultra split visible, with the reason for each. */
export function Roster({ agents }: { agents: AgentModel[] }) {
  return (
    <div className="roster">
      {agents.map((a) => (
        <div className="member" key={a.id}>
          <b>{a.label}</b>
          <TierBadge tier={a.tier} />
          {a.model && (
            <div>
              <code>{a.model}</code>
            </div>
          )}
          <p>{a.why}</p>
        </div>
      ))}
    </div>
  );
}
