import { useState, type FormEvent, type ReactNode } from "react";
import type { AppConfig } from "../../types";
import { BoardTable } from "../boardroom/BoardTable";
import { SEATS, type Seat, type SeatState } from "../../lib/minutes";
import { Roster } from "./Roster";

/** A committee member's name with its identity colour mark, as used across the results. */
function Member({ id, children }: { id: string; children: ReactNode }) {
  return <span className={`member id-${id}`}><i className="id-mark" aria-hidden="true" />{children}</span>;
}

const AGENDA: { title: string; text: ReactNode }[] = [
  { title: "Figures first", text: "Prices, fundamentals and headlines are fetched, then every indicator (RSI, MACD, moving averages, volatility, beta, P/E) is calculated in Java before any model is called." },
  {
    title: "Opening positions",
    text: (
      <>
        <Member id="fundamentals">Fundamentals</Member> and <Member id="risk">risk</Member> on Nemotron Super,{" "}
        <Member id="technicals">technicals</Member> on Nemotron Nano. Each analyst takes a side and may only cite the figures it was given.
      </>
    ),
  },
  { title: "One rebuttal, if asked for", text: "Each analyst answers the colleague it disagrees with most. One round, then the floor closes." },
  { title: "The chair's call", text: "Nemotron Ultra weighs the arguments, calls BUY, HOLD or SELL with a confidence, and puts the strongest dissent on the record." },
];

const RULES = [
  { title: "Models don't do arithmetic.", text: "They get a fact sheet computed in code and are told to quote from it, nothing else." },
  { title: "Every reply has a shape.", text: "Answers must match a JSON schema generated from the Java records. A malformed reply gets one retry with the errors attached, never two." },
  { title: "Every figure is traced.", text: "Numbers an analyst cites are matched against its input, allowing for rounding. Untraceable evidence is thrown out; untraceable prose is flagged on the page." },
  { title: "The budget is hard.", text: "Spend is checked before each call and kept across restarts. When the cap is reached, the committee stops meeting and saved decisions are served instead." },
];

const IDLE = Object.fromEntries(SEATS.map((s) => [s, "idle"])) as Record<Seat, SeatState>;

const today = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());

interface Props {
  config: AppConfig | null;
  onConvene: (ticker: string, rebuttals: boolean) => void;
}

export function Landing({ config, onConvene }: Props) {
  const [ticker, setTicker] = useState("");
  const [rebuttals, setRebuttals] = useState(true);
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
              <h1>An AI investment committee you can hold to&nbsp;account.</h1>
              <p className="lede">
                Watch three NVIDIA Nemotron analysts argue a stock across the table, rebut each other, and a Nemotron Ultra chair
                stamp BUY, HOLD or SELL. Every number is computed in code, every figure they quote is checked, and every call is
                scored against the S&amp;P&nbsp;500 afterwards.
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
                <div className="hero-board">
                  <BoardTable agents={agents} states={IDLE} said={{}} decision={null} preview
                    caption={{ title: "The boardroom", line: "Five Nemotron models and one Java clerk, who computes every figure first." }} />
                </div>
                <figcaption>
                  <b>Seating plan.</b> The Clerk computes the numbers in code, the analysts argue in parallel, and only the Chair hears everyone.
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
