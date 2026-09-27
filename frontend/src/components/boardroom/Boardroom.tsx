import { useEffect, useRef, useState } from "react";
import type { CommitteeState } from "../../state/committee";
import { reportList } from "../../state/committee";
import type { AgentModel, ThesisResult } from "../../types";
import { useMeeting } from "../../hooks/useMeeting";
import { Consensus } from "../committee/Verdict";
import { CallsTable } from "../committee/CostPanel";
import { MemoPanel } from "../committee/MemoPanel";
import { KeyStats } from "../market/KeyStats";
import { NewsPanel } from "../market/NewsPanel";
import { PriceChart } from "../market/PriceChart";
import { Card } from "../ui/Card";
import { TabPanel, Tabs, type TabDef } from "../ui/Tabs";
import { RunNotices } from "../workspace/RunNotices";
import { SecurityHeader } from "../workspace/SecurityHeader";
import { ThesisTab } from "../workspace/ThesisTab";
import { BoardTable } from "./BoardTable";
import { ProofPanel } from "./ProofPanel";
import { Transcript } from "./Transcript";

type Dossier = "market" | "memo" | "thesis" | "calls";

interface Props {
  state: CommitteeState;
  agents: AgentModel[];
  onFile: string[];
  onConvene: (ticker: string) => void;
  onOpenRecord: () => void;
}

/** One committee session as a meeting: the table, the minutes, then the proof and the dossier. */
export function Boardroom({ state, agents, onFile, onConvene, onOpenRecord }: Props) {
  const { entries, onScreen, shown, pending, skip, states, said, next, caption, decision } = useMeeting(state);
  const session = state.timing.run?.start;
  const running = state.status === "running";

  const [dossier, setDossier] = useState<Dossier>("market");
  const [thesis, setThesis] = useState<ThesisResult | null>(null);
  useEffect(() => {
    setDossier("market");
    setThesis(null);
  }, [state.ticker, session]);

  // Keep the newest statement in view while the minutes are being read.
  const feed = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (pending || running) feed.current?.scrollTo({ top: feed.current.scrollHeight });
  }, [shown, pending, running]);

  const flags = Object.fromEntries((state.result?.integrity ?? []).map((f) => [f.agent, f.figures]));
  const finished = Boolean(state.result) && !pending;
  const s = state.snapshot;

  const tabs: TabDef<Dossier>[] = [
    { id: "market", label: "Market data" },
    { id: "memo", label: "Memo" },
    { id: "thesis", label: "Challenge the committee" },
    { id: "calls", label: "Every model call", count: state.result?.costs.calls.length },
  ];

  return (
    <main className="boardroom-page">
      <SecurityHeader state={state} tabs={null} decision={decision} />
      <div className="container ws-body">
        <RunNotices state={state} onFile={onFile} onConvene={onConvene} />

        <div className="room">
          <div className="room-stage">
            <BoardTable agents={agents} states={states} said={said} caption={caption} decision={decision} />
            {decision && reportList(state).length > 0 && (
              <div className="room-vote card"><Consensus reports={reportList(state)} decision={decision} /></div>
            )}
          </div>

          <section className="room-minutes card" aria-labelledby="minutes-h">
            <header className="card-head">
              <div className="row" style={{ gap: 10 }}>
                <h2 id="minutes-h">Minutes</h2>
                {(running || pending) && <span className="sub"><i className="live" aria-hidden="true" /> in session</span>}
              </div>
              {pending && entries.length - shown > 1 && <button className="linkish small" onClick={skip}>Skip to the ruling</button>}
            </header>
            <div className="card-body" ref={feed}>
              {onScreen.length === 0 && !next ? (
                <p className="small dim">{running ? "Calling the committee to order…" : "Nothing was minuted in this session."}</p>
              ) : (
                <Transcript entries={onScreen} agents={agents} costs={state.result?.costs ?? null} flags={flags} checked={finished} next={next} />
              )}
            </div>
          </section>
        </div>

        {finished && state.result && <ProofPanel result={state.result} onOpenRecord={onOpenRecord} />}

        {s && (
          <section className="dossier">
            <Tabs tabs={tabs} active={dossier} onChange={setDossier} label="Dossier" />
            <TabPanel id={dossier}>
              {dossier === "market" && (
                <div className="grid">
                  <div className="col-8"><Card title="Price" sub="Daily closes with SMA50 and SMA200"><PriceChart points={s.priceHistory} currency={s.currency} /></Card></div>
                  <div className="col-4 stack-16">
                    <KeyStats snapshot={s} />
                    <NewsPanel ticker={state.ticker} digest={state.digest} news={state.news} />
                  </div>
                </div>
              )}
              {dossier === "memo" && (state.result ? <MemoPanel result={state.result} /> : <Card><div className="empty"><b>The memo is written when the committee rises.</b></div></Card>)}
              {dossier === "thesis" && <ThesisTab state={state} result={thesis} onResult={setThesis} />}
              {dossier === "calls" && (state.result ? <CallsTable costs={state.result.costs} /> : <Card><div className="empty"><b>The call log appears when the session ends.</b></div></Card>)}
            </TabPanel>
          </section>
        )}
      </div>
    </main>
  );
}
