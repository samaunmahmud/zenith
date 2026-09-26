import type { AgentModel } from "../../types";
import { TierBadge } from "../ui/Badges";

/** Makes the Nano / Super / Ultra split visible, with the reason for each choice. */
export function Roster({ agents }: { agents: AgentModel[] }) {
  return (
    <div className="card">
      <div className="table-wrap">
        <table className="table roster">
          <thead>
            <tr><th>Seat</th><th>Model</th><th>Why this size</th></tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id}>
                <td><b style={{ fontWeight: 600 }}>{a.label}</b></td>
                <td>
                  <div className="stack" style={{ gap: 4 }}>
                    <TierBadge tier={a.tier} />
                    {a.model && <code className="xs dim">{a.model}</code>}
                  </div>
                </td>
                <td className="wrap">{a.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
