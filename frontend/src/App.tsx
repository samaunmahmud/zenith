import { useEffect, useReducer, useRef, useState, type FormEvent } from "react";
import { fetchConfig, streamCommittee } from "./api";
import { AnalystCard } from "./components/AnalystCard";
import { CostPanel } from "./components/CostPanel";
import { MemoPanel } from "./components/MemoPanel";
import { Roster } from "./components/Roster";
import { SnapshotBar } from "./components/SnapshotBar";
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
const STAGES: { id: Stage; label: string }[] = [
  { id: "data", label: "Market data" },
  { id: "news", label: "News desk" },
  { id: "analysts", label: "Analysts" },
  { id: "rebuttals", label: "Rebuttals" },
  { id: "chair", label: "Chair" },
  { id: "memo", label: "Memo" },
];

interface State {
  status: "idle" | "running" | "done" | "error";
  ticker: string;
  stage: Stage | null;
  stagesSeen: Stage[];
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
}

const initial: State = {
  status: "idle",
  ticker: "",
  stage: null,
  stagesSeen: [],
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
};

type Action = { type: "start"; ticker: string } | { type: "event"; event: CommitteeEvent };

function reducer(state: State, action: Action): State {
  if (action.type === "start") return { ...initial, status: "running", ticker: action.ticker };
  const e = action.event;
  switch (e.type) {
    case "stage":
      return { ...state, stage: e.stage, stagesSeen: [...state.stagesSeen, e.stage] };
    case "snapshot":
      return { ...state, snapshot: e.snapshot, sources: e.sources, agents: e.agents };
    case "news":
      return { ...state, digest: e.digest };
    case "report":
      return { ...state, reports: { ...state.reports, [e.report.analyst]: e.report } };
    case "analystError":
      return { ...state, errors: { ...state.errors, [e.analyst]: e.message } };
    case "rebuttal":
      return { ...state, rebuttals: [...state.rebuttals, e.rebuttal] };
    case "decision":
      return { ...state, decision: e.decision };
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
      };
    }
    case "error":
      return { ...state, status: "error", stage: null, error: e.message };
  }
}

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="18" cy="18" r="17" fill="none" stroke="var(--accent)" strokeWidth="2" />
      <path d="M6 26 L14 16 L20 21 L30 8" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="30" cy="8" r="2.5" fill="var(--accent)" />
    </svg>
  );
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initial);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [input, setInput] = useState("");
  const [withRebuttals, setWithRebuttals] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    fetchConfig().then(setConfig);
    return () => stopRef.current?.();
  }, []);

  const convene = (raw: string) => {
    const ticker = raw.trim().toUpperCase();
    if (!ticker || state.status === "running") return;
    setInput(ticker);
    stopRef.current?.();
    dispatch({ type: "start", ticker });
    stopRef.current = streamCommittee(ticker, withRebuttals, (event) => dispatch({ type: "event", event }));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    convene(input);
  };

  const running = state.status === "running";
  const agentFor = (id: string) => state.agents.find((a) => a.id === id) ?? config?.agents.find((a) => a.id === id);
  const stages = STAGES.filter((s) => s.id !== "rebuttals" || withRebuttals || state.rebuttals.length > 0);
  const showRoom = state.status !== "idle" && (state.snapshot || state.status === "running");

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <Logo />
          <div>
            <h1>Zenith</h1>
            <p>An AI investment committee: three analysts argue, the chair decides.</p>
          </div>
        </div>
        <div className="powered">
          Powered by <b>NVIDIA Nemotron</b> on Nebius Token Factory
        </div>
      </header>

      <div className="disclaimer">
        ⚠ Research and education tool only. <b>Not financial advice.</b> Figures are computed from public market data
        that may be delayed or incomplete, and the AI analysts can be wrong.
      </div>

      <form className="panel" onSubmit={onSubmit}>
        <div className="form">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ticker, e.g. AAPL"
            aria-label="Stock ticker"
            maxLength={10}
            autoFocus
          />
          <button className="btn" type="submit" disabled={running || !input.trim()}>
            {running ? "In session…" : "Convene the committee"}
          </button>
        </div>
        <div className="chips">
          {config?.demoTickers.map((t) => (
            <button key={t} type="button" className="chip" disabled={running} onClick={() => convene(t)}>
              {t}
            </button>
          ))}
          {config?.demoMode && <span className="small muted">Demo mode: cached tickers only</span>}
          <label className="toggle" style={{ marginLeft: "auto" }}>
            <input type="checkbox" checked={withRebuttals} onChange={(e) => setWithRebuttals(e.target.checked)} disabled={running} />
            Rebuttal round
          </label>
        </div>
      </form>

      {state.status === "idle" && config && (
        <>
          <div className="section-title">Who's on the committee</div>
          <Roster agents={config.agents} />
        </>
      )}

      {state.status !== "idle" && (
        <div className="progress" aria-live="polite">
          {stages.map((s) => {
            const active = state.stage === s.id;
            const done = !active && (state.status === "done" || state.stagesSeen.includes(s.id));
            return (
              <div key={s.id} className={`step ${active ? "active" : done ? "done" : ""}`}>
                {s.label}
              </div>
            );
          })}
        </div>
      )}

      {state.status === "error" && (
        <div className="notice error">
          <b>The committee couldn't meet.</b> {state.error}
        </div>
      )}
      {state.result?.replayed && (
        <div className="notice warn">
          Live analysis wasn't available, so this is the committee's last saved decision for {state.result.ticker} (
          {state.result.generatedAt.slice(0, 10)}).
        </div>
      )}

      {showRoom && (
        <>
          {state.snapshot && (
            <>
              <div className="section-title">The stock</div>
              <SnapshotBar snapshot={state.snapshot} sources={state.sources} digest={state.digest} />
            </>
          )}

          <div className="section-title">Analyst reports</div>
          <div className="cards">
            {ANALYSTS.map((a) => (
              <AnalystCard
                key={a}
                analyst={a}
                agent={agentFor(a)}
                report={state.reports[a]}
                error={state.errors[a]}
                pending={running && (state.stage === "analysts" || state.stage === "data" || state.stage === "news")}
              />
            ))}
          </div>

          {state.rebuttals.length > 0 && (
            <>
              <div className="section-title">Rebuttal round</div>
              <div className="rebuttals">
                {state.rebuttals.map((r) => (
                  <div key={r.analyst} className="rebuttal">
                    <b>{r.analyst}</b> <span className="muted">→ {r.respondingTo}</span>
                    {r.stanceChanged && <span className="badge stance-neutral" style={{ marginLeft: 8 }}>stance changed</span>}
                    <div>{r.response}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="section-title">Decision</div>
          {state.decision ? (
            <Verdict decision={state.decision} />
          ) : state.result?.chairError ? (
            <div className="notice error">The chair couldn't reach a valid decision: {state.result.chairError}</div>
          ) : (
            <div className="panel muted">{state.stage === "chair" ? "The chair is deliberating…" : "Waiting for the analysts…"}</div>
          )}

          {state.result && (
            <>
              <div className="section-title">Cost & memo</div>
              <div style={{ display: "grid", gap: 16 }}>
                <CostPanel costs={state.result.costs} />
                <MemoPanel result={state.result} />
              </div>
            </>
          )}
        </>
      )}

      <footer className="footer">
        Zenith is open source (MIT). Every number is calculated in code; the Nemotron models only interpret it. Not financial advice.
      </footer>
    </div>
  );
}
