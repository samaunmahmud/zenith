import { useState, type FormEvent } from "react";
import type { AppConfig } from "../../types";
import { CommitteeFloor } from "../committee/CommitteeFloor";
import { CalcIcon, CheckIcon, CpuIcon, SearchIcon, ShieldIcon } from "../ui/Icons";
import { Roster } from "./Roster";

const STEPS = [
  { n: "01", title: "Compute", text: "Prices, fundamentals and news are fetched, then every indicator (RSI, MACD, moving averages, volatility, beta, P/E) is calculated in Java." },
  { n: "02", title: "Argue", text: "Three analysts on Nemotron Nano and Super each take a position, citing only the computed figures. Every number is traced back to the input." },
  { n: "03", title: "Rebut", text: "Optionally, each analyst gets one short reply to the colleague it disagrees with most. One round, no endless loops." },
  { n: "04", title: "Decide", text: "The chair on Nemotron Ultra weighs the arguments, makes a BUY / HOLD / SELL call and records the strongest dissent." },
];

const GUARDRAILS = [
  { title: "Code calculates", text: "Models never do arithmetic. They receive a fact sheet of figures computed in Java and are told to quote only those." },
  { title: "Schema-constrained", text: "Every reply must match a JSON schema generated from the Java records, then pass validation. One retry with the errors fed back, never more." },
  { title: "Numbers are traced", text: "Each figure an analyst cites is matched against its input (allowing for rounding). Untraceable evidence is rejected; untraceable prose is flagged." },
  { title: "Hard spending cap", text: "The running spend is checked before every call and persisted across restarts. Once the cap is reached, model calls are refused, so a public demo can't run up a bill." },
];

interface Props {
  config: AppConfig | null;
  onConvene: (ticker: string, rebuttals: boolean) => void;
}

export function Landing({ config, onConvene }: Props) {
  const [ticker, setTicker] = useState("");
  const [rebuttals, setRebuttals] = useState(false);
  const agents = config?.agents ?? [];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ticker.trim()) onConvene(ticker, rebuttals);
  };

  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="eyebrow"><i className="live" aria-hidden="true" /> Built on NVIDIA Nemotron · Nebius Token Factory</span>
            <h1>
              Three AI analysts argue. <em>One chair decides.</em>
            </h1>
            <p className="lede">
              Convene an AI investment committee on any US stock. Every figure is computed in code, every argument is on the
              record, and every decision comes with its dissent and its cost.
            </p>
            <form className="search" onSubmit={submit} role="search">
              <SearchIcon />
              <input
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                placeholder="Enter a ticker, e.g. AAPL"
                aria-label="Stock ticker"
                maxLength={10}
                autoFocus
              />
              <button className="btn btn-primary" type="submit" disabled={!ticker.trim()}>Convene the committee</button>
            </form>
            <div className="search-meta">
              <span className="xs dim">Try</span>
              {config?.demoTickers.map((t) => (
                <button key={t} type="button" className="chip" onClick={() => onConvene(t, rebuttals)}>{t}</button>
              ))}
              <label className="switch">
                <input type="checkbox" checked={rebuttals} onChange={(e) => setRebuttals(e.target.checked)} />
                <span className="track" aria-hidden="true" />
                Rebuttal round
              </label>
            </div>
            {config?.demoMode && <p className="xs dim" style={{ marginTop: 10 }}>Demo mode: market data is served from the cache, so only cached tickers work.</p>}
            <div className="trust">
              <span><CpuIcon /> Nano, Super and Ultra, each where it fits</span>
              <span><CalcIcon /> 100% of indicators computed in code</span>
              <span><ShieldIcon /> Hard spending cap</span>
            </div>
          </div>
          {agents.length > 0 && (
            <div className="hero-preview" aria-hidden="true">
              <div className="window">
                <div className="window-bar"><i /><i /><i /><span>Committee session</span></div>
                <CommitteeFloor agents={agents} mode="preview" stage={null} timing={{}} now={0} digest={undefined}
                  reports={{}} errors={{}} decision={null} chairError={null} costs={null} />
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="container">
        <section className="section">
          <div className="card stats-band num">
            <div><b>5</b><span>AI agents on the committee</span></div>
            <div><b>3</b><span>Nemotron model sizes</span></div>
            <div><b>100%</b><span>of indicators calculated in code</span></div>
            <div><b>1</b><span>auditable memo per decision, with its cost</span></div>
          </div>
        </section>

        <section className="section" id="how">
          <div className="section-head">
            <span className="label">How it works</span>
            <h2>LLMs interpret. Code calculates.</h2>
            <p>The models don't calculate anything: they argue about figures computed deterministically from market data, and every figure they cite is checked.</p>
          </div>
          <div className="steps">
            {STEPS.map((s) => (
              <div className="card step" key={s.n}>
                <div className="n">{s.n}</div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section" id="guardrails">
          <div className="section-head">
            <span className="label">Guardrails</span>
            <h2>Built to be checked, not trusted</h2>
            <p>An AI committee is only useful if you can audit it. These rules are enforced in code, on every run.</p>
          </div>
          <div className="guardrails">
            {GUARDRAILS.map((g) => (
              <div className="card guardrail" key={g.title}>
                <span className="check" aria-hidden="true"><CheckIcon /></span>
                <div>
                  <h3>{g.title}</h3>
                  <p>{g.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="section" id="committee">
          <div className="section-head">
            <span className="label">The committee</span>
            <h2>The right model for each seat</h2>
            <p>Reasoning is spent where it matters: fast Nano for narrow tasks, Super for weighing evidence, and a single Ultra call for the final judgement.</p>
          </div>
          <Roster agents={agents} />
        </section>
      </div>
    </>
  );
}
