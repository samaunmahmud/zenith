import type { CommitteeState } from "../../state/committee";
import type { AgentModel } from "../../types";
import { CallsTable, CostPanel } from "../committee/CostPanel";
import { Roster } from "../landing/Roster";
import { Card } from "../ui/Card";

/** Which Nemotron model did what, and what it cost. */
export function ModelsTab({ state, agents }: { state: CommitteeState; agents: AgentModel[] }) {
  const costs = state.result?.costs;
  return (
    <div className="grid">
      <div className="col-5 stack-16">
        {costs ? (
          <CostPanel costs={costs} />
        ) : (
          <Card title="Committee cost">
            <p className="small dim">{state.status === "running" ? "The cost readout appears when the committee finishes." : "No model calls were made in this session."}</p>
          </Card>
        )}
      </div>
      <div className="col-7 stack-16">
        <Roster agents={agents} />
      </div>
      {costs && costs.calls.length > 0 && (
        <div className="col-12">
          <CallsTable costs={costs} />
        </div>
      )}
    </div>
  );
}
