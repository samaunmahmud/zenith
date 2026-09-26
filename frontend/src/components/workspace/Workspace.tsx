import { useEffect, useState } from "react";
import type { CommitteeState } from "../../state/committee";
import type { AgentModel } from "../../types";
import { useNow } from "../../hooks/useNow";
import { MemoPanel } from "../committee/MemoPanel";
import { Card } from "../ui/Card";
import { TabPanel, Tabs, type TabDef } from "../ui/Tabs";
import { AnalystsTab } from "./AnalystsTab";
import { DebateTab } from "./DebateTab";
import { ModelsTab } from "./ModelsTab";
import { OverviewTab } from "./OverviewTab";
import { RunNotices } from "./RunNotices";
import { SecurityHeader } from "./SecurityHeader";

type TabId = "overview" | "analysts" | "debate" | "memo" | "models";

/** The results view for one ticker: sticky security header, tabs, and the active tab's content. */
interface Props {
  state: CommitteeState;
  agents: AgentModel[];
  /** Tickers with saved decisions: offered when this one can't be analysed. */
  onFile: string[];
  onConvene: (ticker: string) => void;
}

export function Workspace({ state, agents, onFile, onConvene }: Props) {
  const [tab, setTab] = useState<TabId>("overview");
  const running = state.status === "running";
  const now = useNow(running);

  // A new session always opens on the overview.
  useEffect(() => setTab("overview"), [state.ticker, state.timing.run?.start]);

  const reports = Object.keys(state.reports).length;
  const tabs: TabDef<TabId>[] = [
    { id: "overview", label: "Overview", live: running },
    { id: "analysts", label: "Analysts", count: reports },
    { id: "debate", label: "Debate", count: state.debate.length },
    { id: "memo", label: "Memo" },
    { id: "models", label: "Models & cost" },
  ];

  return (
    <main>
      <SecurityHeader state={state} tabs={<Tabs tabs={tabs} active={tab} onChange={setTab} label="Committee results" />} />
      <div className="container ws-body">
        <RunNotices state={state} onFile={onFile} onConvene={onConvene} />
        <TabPanel id={tab}>
          {tab === "overview" && <OverviewTab state={state} agents={agents} now={now} openTab={setTab} />}
          {tab === "analysts" && <AnalystsTab state={state} agents={agents} />}
          {tab === "debate" && <DebateTab state={state} />}
          {tab === "memo" &&
            (state.result ? (
              <MemoPanel result={state.result} />
            ) : (
              <Card>
                <div className="empty">
                  <b>{running ? "The memo is written when the committee finishes." : "No memo for this session."}</b>
                  It is assembled in code from the agents' structured output.
                </div>
              </Card>
            ))}
          {tab === "models" && <ModelsTab state={state} agents={agents} />}
        </TabPanel>
      </div>
    </main>
  );
}
