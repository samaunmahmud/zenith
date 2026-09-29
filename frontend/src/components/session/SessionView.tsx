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
import { AnalystCards } from "./AnalystCards";
import { AskPanel } from "./AskPanel";
import { CostMeter } from "./CostMeter";
import { FactsPanel, IntegrityPanel, NewsPanel } from "./DataPanels";
import { EventLog } from "./EventLog";
import { Panel } from "./Panel";
import { QuoteStrip } from "./QuoteStrip";
import { Timeline } from "./Timeline";
import { VerdictPanel } from "./VerdictPanel";

type Dossier = "memo" | "log" | "thesis" | "calls";

interface Props {
  state: CommitteeState;
  onFile: string[];
  onConvene: (ticker: string) => void;
}

/**
 * One committee session, verdict first: the chair's ruling (or the session's progress), the three analysts, then how
 * the work was done (pipeline and cost), the follow-up chat, the market data, and the full dossier. A live run is
 * timed as it happens; a saved run is replayed from its recorded timeline.
 */
export function SessionView({ state, onFile, onConvene }: Props) {
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
    { id: "log", label: "Transcript" },
    { id: "thesis", label: "Challenge the committee" },
    { id: "calls", label: "Raw model calls", count: state.result?.costs.calls.length },
  ];
  const canAsk = Boolean(state.result && state.decision && play.finished);

  return (
    <main className="tx">
      <QuoteStrip state={state} play={play} decision={decision} />
      <div className="container tx-body">
        <RunNotices state={state} onFile={onFile} onConvene={onConvene} />

        <VerdictPanel state={state} play={play} decision={decision} />
        <AnalystCards state={state} play={play} />

        <div className="tgrid">
          <Timeline play={play} />
          <CostMeter state={state} play={play} />
        </div>

        {s && (
          <div className="tgrid">
            <div className="tcol">
              {canAsk && <AskPanel key={`${state.ticker}-${state.result!.generatedAt}`} state={state} />}
              <Panel title="Price · 1 year" id="px" meta="daily close with 50 and 200-day averages">
                <PriceChart points={s.priceHistory} currency={s.currency} />
              </Panel>
              <NewsPanel state={state} />
            </div>
            <div className="tcol">
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
              {dossier === "log" && <EventLog state={state} play={play} />}
              {dossier === "thesis" && <ThesisTab state={state} result={thesis} onResult={setThesis} />}
              {dossier === "calls" && <CallsTable costs={state.result.costs} />}
            </TabPanel>
          </section>
        )}
      </div>
    </main>
  );
}
