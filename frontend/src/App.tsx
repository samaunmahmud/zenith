import { useEffect, useReducer, useRef, useState, type FormEvent } from "react";
import { fetchConfig, streamCommittee } from "./api";
import { AnalystCard } from "./components/AnalystCard";
import { CommitteeFloor, type Timing } from "./components/CommitteeFloor";
import { CostPanel } from "./components/CostPanel";
import { MemoPanel } from "./components/MemoPanel";
import { SnapshotBar } from "./components/SnapshotBar";
import { BrandMark } from "./components/Brand";
import { Landing } from "./components/Landing";
import { Verdict } from "./components/Verdict";
import type {
  AgentModel,
  AnalystName,
  AnalystReport,
  AppConfig,
  ChairDecision,
  CommitteeEvent,
  CommitteeResult,
  NewsDigest,
  Rebuttal,
  Snapshot,
  SourceInfo,
  Stage,
} from "./types";

const ANALYSTS: AnalystName[] = ["fundamentals", "technicals", "risk"];
const TITLES: Record<AnalystName, string> = { fundamentals: "Fundamentals", technicals: "Technicals", risk: "Risk" };

interface State {
  status: "idle" | "running" | "done" | "error";
  ticker: string;
  stage: Stage | null;
  snapshot: Snapshot | null;
  sources: SourceInfo[];
  agents: AgentModel[];
  digest: NewsDigest | null | undefined;
  reports: Partial<Record<AnalystName, AnalystReport>>;
  errors: Partial<Record<AnalystName, string>>;
  rebuttals: Rebuttal[];
  decision: ChairDecision | null;
  result: CommitteeResult | null;
  error: string | null;
  /** HTTP-style status of the failure: 503 = AI switched off (not configured / budget spent), 0 = connection lost. */
  errorStatus: number | null;
  /** When each agent started and finished, as seen by this browser (the floor's live clocks). */
  timing: Timing;
}

const initial: State = {
  status: "idle",
  ticker: "",
  stage: null,
  snapshot: null,
  sources: [],
  agents: [],
  digest: undefined,
  reports: {},
  errors: {},
  rebuttals: [],
  decision: null,
  result: null,
  error: null,
  errorStatus: null,
  timing: {},
};

type Action =
  | { type: "start"; ticker: string; at: number }
  | { type: "reset" }
  | { type: "event"; event: CommitteeEvent; at: number };

const STAGE_AGENTS: Partial<Record<Stage, string[]>> = { news: ["news"], analysts: ANALYSTS, chair: ["chair"] };

function mark(timing: Timing, ids: string[], key: "start" | "end", at: number): Timing {
  const next = { ...timing };
  for (const id of ids) if (next[id]?.[key] === undefined) next[id] = { ...next[id], [key]: at };
  return next;
}

function reducer(state: State, action: Action): State {
  if (action.type === "start") return { ...initial, status: "running", ticker: action.ticker, timing: { run: { start: action.at } } };
  if (action.type === "reset") return initial;
  const { event: e, at } = action;
  switch (e.type) {
    case "stage":
      return { ...state, stage: e.stage, timing: mark(state.timing, STAGE_AGENTS[e.stage] ?? [], "start", at) };
    case "snapshot":
      return { ...state, snapshot: e.snapshot, sources: e.sources, agents: e.agents };
    case "news":
      return { ...state, digest: e.digest, timing: mark(state.timing, ["news"], "end", at) };
    case "report":
      return { ...state, reports: { ...state.reports, [e.report.analyst]: e.report }, timing: mark(state.timing, [e.report.analyst], "end", at) };
    case "analystError":
      return { ...state, errors: { ...state.errors, [e.analyst]: e.message }, timing: mark(state.timing, [e.analyst], "end", at) };
    case "rebuttal":
      return { ...state, rebuttals: [...state.rebuttals, e.rebuttal] };
    case "decision":
      return { ...state, decision: e.decision, timing: mark(state.timing, ["chair"], "end", at) };
    case "done": {
      // The final result is the source of truth (it also covers replays, which send no progress events).
      const r = e.result;
      return {
        ...state,
        status: "done",
        stage: null,
        snapshot: r.snapshot,
        sources: r.sources,
        agents: r.agents,
        digest: r.newsDigest,
        reports: Object.fromEntries(r.reports.map((x) => [x.analyst, x])),
        errors: Object.fromEntries(r.analystErrors.map((x) => [x.analyst, x.message])),
        rebuttals: r.rebuttals,
        decision: r.decision,
        result: r,
        timing: mark(state.timing, ["run"], "end", at),
      };
    }
    case "error":
      return { ...state, status: "error", stage: null, error: e.message, errorStatus: e.status, timing: mark(state.timing, ["run"], "end", at) };
  }
}

/** Re-renders on an interval while `active`, so the floor's clocks tick. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initial);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [input, setInput] = useState("");
  const [withRebuttals, setWithRebuttals] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const running = state.status === "running";
  const now = useNow(running);

  const convene = (raw: string, rebuttals = withRebuttals) => {
    const ticker = raw.trim().toUpperCase();
    if (!ticker || state.status === "running") return;
    setInput(ticker);
    stopRef.current?.();
    dispatch({ type: "start", ticker, at: performance.now() });
    // Keep the URL shareable: /?ticker=NVDA&rebuttals=true reopens this run.
    const qs = new URLSearchParams({ ticker, ...(rebuttals ? { rebuttals: "true" } : {}) });
    window.history.replaceState(null, "", `?${qs}`);
    stopRef.current = streamCommittee(ticker, rebuttals, (event) => dispatch({ type: "event", event, at: performance.now() }));
  };

  // Run once on load. The ref guard matters: React StrictMode runs effects twice in development,
  // which would otherwise start (and pay for) two committee runs. The browser closes the stream on unload.
  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    fetchConfig().then(setConfig);
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("ticker");
    if (fromUrl) {
      const rebuttals = params.get("rebuttals") === "true";
      setWithRebuttals(rebuttals);
      convene(fromUrl, rebuttals);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    convene(input);
  };

  const goHome = () => {
    stopRef.current?.();
    window.history.replaceState(null, "", window.location.pathname);
    dispatch({ type: "reset" });
    setInput("");
  };

  const idle = state.status === "idle";
  const halted = state.status === "error";
  const agents = state.agents.length ? state.agents : config?.agents ?? [];
  const agentFor = (id: string) => agents.find((a) => a.id === id);
  const reportList = ANALYSTS.map((a) => state.reports[a]).filter((r): r is AnalystReport => Boolean(r));
  const stanceOf = (a: AnalystName) => state.reports[a]?.stance;

  return (
    <>
      <header className="topbar">
        <div className="container">
          <a className="brand" href="/" onClick={(e) => { e.preventDefault(); goHome(); }}>
            <BrandMark />
            ZENITH
          </a>
          <nav className="nav">
            <a className="hide-sm" href="#how" onClick={() => !idle && goHome()}>How it works</a>
            <a className="hide-sm" href="#committee" onClick={() => !idle && goHome()}>Committee</a>
            <a href="https://github.com/samaunmahmud/zenith" target="_blank" rel="noreferrer">GitHub</a>
          </nav>
        </div>
      </header>

      <section className={`hero ${idle ? "" : "compact"}`}>
        <div className="container hero-grid">
          <div>
            <div className="eyebrow">Powered by NVIDIA Nemotron on Nebius Token Factory</div>
            <h1>
              Three AI analysts argue. <span className="accent">One chair decides.</span>
            </h1>
            <p className="lede">
              Enter a stock ticker to convene an AI investment committee. Every figure is computed in code, every argument
              is on the record, and every decision comes with its dissent and its cost.
            </p>
            <form className="form" onSubmit={onSubmit}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Enter a ticker, e.g. AAPL"
                aria-label="Stock ticker"
                maxLength={10}
                autoFocus
              />
              <button className="btn" type="submit" disabled={running}>
                {running ? "In session…" : "Convene the committee"}
              </button>
            </form>
            <div className="form-meta">
              <span className="label">Try</span>
              {config?.demoTickers.map((t) => (
                <button key={t} type="button" className="chip" disabled={running} onClick={() => convene(t)}>
                  {t}
                </button>
              ))}
              {config?.demoMode && <span className="small dim">Demo mode: cached tickers only</span>}
              <label className="toggle">
                <input type="checkbox" checked={withRebuttals} onChange={(e) => setWithRebuttals(e.target.checked)} disabled={running} />
                Rebuttal round
              </label>
            </div>
          </div>
          {idle && agents.length > 0 && (
            <div className="hero-floor">
              <CommitteeFloor
                agents={agents} mode="preview" stage={null} timing={{}} now={0}
                digest={undefined} reports={{}} errors={{}} decision={null} chairError={null} costs={null}
              />
            </div>
          )}
        </div>
      </section>

      <main className="container">
        {idle && config && <Landing agents={config.agents} />}

        {!idle && agents.length > 0 && (
          <section className="section tight">
            <CommitteeFloor
              agents={agents}
              mode={running ? "running" : halted ? "error" : "done"}
              stage={state.stage}
              timing={state.timing}
              now={now}
              digest={state.digest}
              reports={state.reports}
              errors={state.errors}
              decision={state.decision}
              chairError={state.result?.chairError ?? null}
              costs={state.result?.costs ?? null}
            />
          </section>
        )}

        {halted && (
          <div className={`notice ${state.errorStatus === 503 ? "warn" : "error"}`}>
            {state.errorStatus === 503 ? (
              <>
                <b>The AI committee is switched off right now.</b> Its model budget is used up or not configured, so no Nemotron
                calls were made.{state.snapshot && " The market data and indicators below were still computed live."}
                <div className="small dim" style={{ marginTop: 4 }}>{state.error}</div>
              </>
            ) : (
              <>
                <b>The committee couldn't finish.</b> {state.error}
                {state.snapshot && <div className="small muted">The market data below was computed successfully; the AI analysis did not run.</div>}
              </>
            )}
          </div>
        )}
        {state.result?.replayed && (
          <div className="notice warn">
            Live analysis wasn't available, so this is the committee's last saved decision for {state.result.ticker} (
            {state.result.generatedAt.slice(0, 10)}).
          </div>
        )}

        {(state.decision || state.result?.chairError) && (
          <section className="section" id="decision">
            <div className="section-head"><h2>Decision</h2></div>
            {state.decision ? (
              <Verdict decision={state.decision} reports={reportList} />
            ) : (
              <div className="notice error">The chair couldn't reach a valid decision: {state.result?.chairError}</div>
            )}
          </section>
        )}

        {!idle && state.snapshot && (
          <section className="section">
            <div className="section-head"><h2>The stock</h2></div>
            <SnapshotBar snapshot={state.snapshot} sources={state.sources} digest={state.digest} />
          </section>
        )}

        {!idle && (state.snapshot || running) && (
          <section className="section">
            <div className="section-head">
              <h2>Analyst reports</h2>
              <p>Each analyst works independently from its own fact sheet. Open "What this analyst sees" to check every number it was given.</p>
            </div>
            <div className="cards">
              {ANALYSTS.map((a) => (
                <AnalystCard
                  key={a}
                  analyst={a}
                  agent={agentFor(a)}
                  report={state.reports[a]}
                  error={state.errors[a]}
                  pending={running && (state.stage === "analysts" || state.stage === "news")}
                  halted={halted}
                  facts={state.snapshot?.facts[a]}
                />
              ))}
            </div>
          </section>
        )}

        {state.rebuttals.length > 0 && (
          <section className="section">
            <div className="section-head">
              <h2>Rebuttal round</h2>
              <p>One reply each, to the colleague it disagrees with most. No open-ended debate loops.</p>
            </div>
            <div className="rebuttals">
              {state.rebuttals.map((r) => (
                <div key={r.analyst} className={`rebuttal stance-edge-${stanceOf(r.analyst) ?? "neutral"}`}>
                  <div className="who">
                    <b className={`stance-${stanceOf(r.analyst) ?? "neutral"}`}>{TITLES[r.analyst]}</b>
                    <span className="dim"> replies to </span>
                    <b className={`stance-${stanceOf(r.respondingTo) ?? "neutral"}`}>{TITLES[r.respondingTo]}</b>
                    {r.stanceChanged && <span className="badge stance-neutral" style={{ marginLeft: 8 }}>stance changed</span>}
                  </div>
                  <p>{r.response}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {state.result && (
          <section className="section">
            <div className="section-head"><h2>Cost &amp; memo</h2></div>
            <div className="two-col">
              <CostPanel costs={state.result.costs} />
              <MemoPanel result={state.result} />
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <div className="container">
          <p>
            <b style={{ color: "var(--text)" }}>Research and education tool only. Not financial advice.</b> Figures are computed from public
            market data that may be delayed or incomplete, and the AI analysts can be wrong.
          </p>
          <p>
            Zenith · MIT licensed · <a href="https://github.com/samaunmahmud/zenith" target="_blank" rel="noreferrer">Source on GitHub</a>
          </p>
        </div>
      </footer>
    </>
  );
}
