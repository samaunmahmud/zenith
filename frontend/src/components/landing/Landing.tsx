import { useState, type FormEvent } from "react";
import type { AppConfig } from "../../types";
import { CommitteeFloor } from "../committee/CommitteeFloor";
import { Roster } from "./Roster";

const AGENDA = [
  { title: "Figures first", text: "Prices, fundamentals and headlines are fetched, then every indicator (RSI, MACD, moving averages, volatility, beta, P/E) is calculated in Java before any model is called." },
  { title: "Opening positions", text: "Fundamentals and risk on Nemotron Super, technicals on Nemotron Nano. Each analyst takes a side and may only cite the figures it was given." },
  { title: "One rebuttal, if asked for", text: "Each analyst answers the colleague it disagrees with most. One round, then the floor closes." },
  { title: "The chair's call", text: "Nemotron Ultra weighs the arguments, calls BUY, HOLD or SELL with a confidence, and puts the strongest dissent on the record." },
];

const RULES = [
  { title: "Models don't do arithmetic.", text: "They get a fact sheet computed in code and are told to quote from it, nothing else." },
  { title: "Every reply has a shape.", text: "Answers must match a JSON schema generated from the Java records. A malformed reply gets one retry with the errors attached, never two." },
  { title: "Every figure is traced.", text: "Numbers an analyst cites are matched against its input, allowing for rounding. Untraceable evidence is thrown out; untraceable prose is flagged on the page." },
  { title: "The budget is hard.", text: "Spend is checked before each call and kept across restarts. When the cap is reached, the committee stops meeting and saved decisions are served instead." },
];

const today = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());

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
    <main>
      <section className="hero">
        <div className="container">
          <div className="masthead">
            <span>Research desk</span>
            <span className="num">{today}</span>
          </div>
          <div className="hero-grid">
            <div>
              <h1>Put a stock in front of a&nbsp;committee.</h1>
              <p className="lede">
                Three analysts read the same figures and argue a position. A chair on NVIDIA Nemotron Ultra hears them out,
                makes the call and writes down who disagreed. You get the minutes, a memo and the bill.
              </p>
              <form className="convene" onSubmit={submit} role="search">
                <label htmlFor="ticker" className="convene-label">Ticker</label>
                <div className="convene-row">
                  <input
                    id="ticker"
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value)}
                    placeholder="AAPL"
                    maxLength={10}
                    autoComplete="off"
                    spellCheck={false}
                    autoFocus
                  />
                  <button className="btn btn-primary" type="submit" disabled={!ticker.trim()}>Convene</button>
                </div>
              </form>
              <div className="convene-meta">
                {config && config.demoTickers.length > 0 && (
                  <div className="recent">
                    <span>On file</span>
                    {config.demoTickers.map((t) => (
                      <button key={t} type="button" className="ticker-link" onClick={() => onConvene(t, rebuttals)}>{t}</button>
                    ))}
                  </div>
                )}
                <label className="switch">
                  <input type="checkbox" checked={rebuttals} onChange={(e) => setRebuttals(e.target.checked)} />
                  <span className="track" aria-hidden="true" />
                  Allow a rebuttal round
                </label>
              </div>
              {config?.demoMode && <p className="xs dim" style={{ marginTop: 12 }}>Demo mode: market data comes from the cache, so only the tickers on file work.</p>}
            </div>
            {agents.length > 0 && (
              <figure className="hero-figure" aria-hidden="true">
                <CommitteeFloor agents={agents} mode="preview" stage={null} timing={{}} now={0} digest={undefined}
                  reports={{}} errors={{}} decision={null} chairError={null} costs={null} />
                <figcaption>
                  <b>Seating plan.</b> The news desk briefs three analysts in parallel; only the chair sees everyone's work.
                </figcaption>
              </figure>
            )}
          </div>
        </div>
      </section>

      <div className="container">
        <section className="doc-section" id="how">
          <header>
            <h2>Order of business</h2>
            <p>What happens between pressing Convene and reading the memo, usually about a minute.</p>
          </header>
          <ol className="agenda">
            {AGENDA.map((a) => (
              <li key={a.title}>
                <h3>{a.title}</h3>
                <p>{a.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="doc-section" id="rules">
          <header>
            <h2>Standing rules</h2>
            <p>An AI committee is only worth reading if you can check its working. These are enforced in code on every run.</p>
          </header>
          <ul className="rules">
            {RULES.map((r) => (
              <li key={r.title}><b>{r.title}</b> {r.text}</li>
            ))}
          </ul>
        </section>

        <section className="doc-section" id="committee">
          <header>
            <h2>The seats</h2>
            <p>Reasoning is spent where it pays: Nano for narrow reads, Super for weighing evidence, one Ultra call for the judgement.</p>
          </header>
          <Roster agents={agents} />
        </section>
      </div>
    </main>
  );
}
