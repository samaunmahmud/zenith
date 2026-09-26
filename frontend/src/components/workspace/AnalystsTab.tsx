import type { CommitteeState } from "../../state/committee";
import type { AgentModel } from "../../types";
import { ANALYSTS } from "../../lib/format";
import { AnalystCard } from "../committee/AnalystCard";

export function AnalystsTab({ state, agents }: { state: CommitteeState; agents: AgentModel[] }) {
  const running = state.status === "running";
  return (
    <div className="stack-16">
      <p className="muted" style={{ maxWidth: "60em" }}>
        Each analyst works independently from its own fact sheet. Open "What this analyst sees" to check every number it was given.
      </p>
      <div className="acards">
        {ANALYSTS.map((a) => (
          <AnalystCard
            key={a}
            analyst={a}
            agent={agents.find((x) => x.id === a)}
            report={state.reports[a]}
            error={state.errors[a]}
            pending={running && (state.stage === "analysts" || state.stage === "news" || state.stage === "data")}
            halted={state.status === "error"}
            facts={state.snapshot?.facts[a]}
          />
        ))}
      </div>
    </div>
  );
}
