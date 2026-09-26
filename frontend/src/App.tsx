import { useEffect, useState } from "react";
import { fetchConfig } from "./api";
import { useCommittee } from "./hooks/useCommittee";
import { useHealth } from "./hooks/useHealth";
import type { AppConfig } from "./types";
import { Landing } from "./components/landing/Landing";
import { Footer } from "./components/layout/Footer";
import { TopBar } from "./components/layout/TopBar";
import { Workspace } from "./components/workspace/Workspace";

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const { state, convene, reset } = useCommittee();
  // Re-check live-AI availability on load and after each session ends (a run may have used up the budget).
  const health = useHealth(state.status === "running" ? "running" : state.timing.run?.end ?? 0);

  useEffect(() => {
    fetchConfig().then(setConfig);
  }, []);

  useEffect(() => {
    document.title = state.status === "idle" ? "Zenith · AI Investment Committee" : `${state.ticker} · Zenith`;
  }, [state.status, state.ticker]);

  const idle = state.status === "idle";
  const agents = state.agents.length ? state.agents : config?.agents ?? [];
  const convenePreservingOptions = (ticker: string) => convene(ticker, state.rebuttals);
  const home = () => {
    reset();
    window.scrollTo({ top: 0 });
  };

  return (
    <>
      <TopBar showSearch={!idle} busy={state.status === "running"} health={health} onSearch={convenePreservingOptions} onHome={home} />
      {idle ? <Landing config={config} onConvene={convene} /> : <Workspace state={state} agents={agents} onFile={config?.demoTickers ?? []} onConvene={convenePreservingOptions} />}
      <Footer />
    </>
  );
}
