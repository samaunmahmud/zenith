import { useEffect, useState } from "react";
import { fetchConfig } from "./api";
import { useCommittee } from "./hooks/useCommittee";
import { useHealth } from "./hooks/useHealth";
import { usePage } from "./hooks/usePage";
import { TrackRecordPage } from "./components/record/TrackRecordPage";
import { ComparePage } from "./components/compare/ComparePage";
import type { AppConfig } from "./types";
import { Landing } from "./components/landing/Landing";
import { Footer } from "./components/layout/Footer";
import { TopBar } from "./components/layout/TopBar";
import { Boardroom } from "./components/boardroom/Boardroom";

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const { state, convene, reset } = useCommittee();
  const [page, setPage] = usePage();
  // Re-check live-AI availability on load and after each session ends (a run may have used up the budget).
  const health = useHealth(state.status === "running" ? "running" : state.timing.run?.end ?? 0);

  useEffect(() => {
    fetchConfig().then(setConfig);
  }, []);

  useEffect(() => {
    if (page) return;
    document.title = state.status === "idle" ? "Zenith · AI Investment Committee" : `${state.ticker} · Zenith`;
  }, [state.status, state.ticker, page]);

  const idle = state.status === "idle";
  const agents = state.agents.length ? state.agents : config?.agents ?? [];
  // Leaving a standalone page for a committee session: the session's own URL (?ticker=) replaces the page's.
  const openTicker = (ticker: string, rebuttals: boolean) => {
    setPage(null);
    convene(ticker, rebuttals);
    window.scrollTo({ top: 0 });
  };
  const convenePreservingOptions = (ticker: string) => openTicker(ticker, state.rebuttals);
  const home = () => {
    setPage(null);
    reset();
    window.scrollTo({ top: 0 });
  };
  const openPage = (p: "record" | "compare") => {
    reset();
    setPage(p);
    window.scrollTo({ top: 0 });
  };

  return (
    <>
      <TopBar showSearch={!idle || page !== null} busy={state.status === "running"} health={health} onSearch={convenePreservingOptions}
        onHome={home} page={page} onPage={openPage} />
      {page === "record" ? (
        <TrackRecordPage onOpen={(t) => openTicker(t, false)} />
      ) : page === "compare" ? (
        <ComparePage agents={config?.agents ?? []} onFile={config?.demoTickers ?? []} onOpen={(t) => openTicker(t, false)} />
      ) : idle ? (
        <Landing config={config} onConvene={openTicker} />
      ) : (
        <Boardroom state={state} agents={agents} onFile={config?.demoTickers ?? []} onConvene={convenePreservingOptions} onOpenRecord={() => openPage("record")} />
      )}
      <Footer />
    </>
  );
}
