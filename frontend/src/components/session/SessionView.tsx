import { useEffect, useState } from "react";
import type { CommitteeState } from "../../state/committee";
import type { ThesisResult } from "../../types";
import { statusAt } from "../../lib/tape";
import { usePlayback } from "../../hooks/usePlayback";
import { CallsTable } from "../committee/CostPanel";
import { MemoPanel } from "../committee/MemoPanel";
import { PriceChart } from "../market/PriceChart";
import { TabPanel, Tabs, type TabDef } from "../ui/Tabs";
import { RunNotices } from "../workspace/RunNotices";
import { ThesisTab } from "../workspace/ThesisTab";
import { AskPanel } from "./AskPanel";
import { CostMeter } from "./CostMeter";
import { FactsPanel, IntegrityPanel, NewsPanel } from "./DataPanels";
import { EventLog } from "./EventLog";
import { Panel } from "./Panel";
import { ProcessMonitor } from "./ProcessMonitor";
import { QuoteStrip } from "./QuoteStrip";
import { StanceBoard } from "./StanceBoard";
import { VerdictPanel } from "./VerdictPanel";

type Dossier = "memo" | "thesis" | "calls";

interface Props {
  state: CommitteeState;
  onFile: string[];
  onConvene: (ticker: string) => void;
}

/**
 * One committee session as a trading terminal: processes and their cost on the left, what they said in the log,
 * the stances and the ruling on the right, and every input underneath. A live run is timed as it happens; a saved
 * run is replayed from its recorded timeline.
 */
export function TerminalSession({ state, onFile, onConvene }: Props) {
  const play = usePlayback(state);
  const chair = play.tape.procs.find((p) => p.id === "chair");
  const decision = chair && statusAt(chair, play.t) === "done" ? state.decision : null;
  const s = state.snapshot;

  const [dossier, setDossier] = useState<Dossier>("memo");
  const [thesis, setThesis] = useState<ThesisResult | null>(null);
  const session = state.timing.run?.start;
  useEffect(() => {
    setDossier("memo");
    setThesis(null);
  }, [state.ticker, session]);

  const tabs: TabDef<Dossier>[] = [
    { id: "memo", label: "Investment memo" },
    { id: "thesis", label: "Challenge the committee" },
    { id: "calls", label: "Raw model calls", count: state.result?.costs.calls.length },
  ];

  return (
    <main className="tx">
      <QuoteStrip state={state} play={play} decision={decision} />
      <div className="container tx-body">
        <RunNotices state={state} onFile={onFile} onConvene={onConvene} />

        <div className="tgrid">
          <div className="tcol tcol-main">
            <ProcessMonitor play={play} />
            <EventLog state={state} play={play} />
            {state.result && state.decision && play.finished && <AskPanel key={`${state.ticker}-${state.result.generatedAt}`} state={state} />}
          </div>
          <div className="tcol tcol-side">
            <VerdictPanel state={state} play={play} decision={decision} />
            <StanceBoard state={state} play={play} decision={decision} />
            <CostMeter state={state} play={play} />
          </div>
        </div>

        {s && (
          <div className="tgrid tgrid-data">
            <div className="tcol tcol-main">
              <Panel code="PX" title="Price · 1 year" id="px" meta="daily close · SMA50 · SMA200">
                <PriceChart points={s.priceHistory} currency={s.currency} />
              </Panel>
              <NewsPanel state={state} />
            </div>
            <div className="tcol tcol-side">
              <IntegrityPanel state={state} play={play} />
              <FactsPanel state={state} />
            </div>
          </div>
        )}

        {state.result && play.finished && (
          <section className="tdossier">
            <Tabs tabs={tabs} active={dossier} onChange={setDossier} label="Dossier" />
            <TabPanel id={dossier}>
              {dossier === "memo" && <MemoPanel result={state.result} />}
              {dossier === "thesis" && <ThesisTab state={state} result={thesis} onResult={setThesis} />}
              {dossier === "calls" && <CallsTable costs={state.result.costs} />}
            </TabPanel>
          </section>
        )}
      </div>
    </main>
  );
}
