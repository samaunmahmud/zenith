import { useEffect, useState, type FormEvent } from "react";
import { fetchTape } from "../../api";
import type { AppConfig, Health, TapeRow } from "../../types";
import { bootLines, parseCommand } from "../../lib/console";
import { modelName, pct, shortDate, toneOf, when } from "../../lib/format";
import { useSymbolSuggest } from "../../hooks/useSymbolSuggest";
import { SearchIcon } from "../ui/Icons";
import { SuggestList } from "../ui/SuggestList";
import { TierTag } from "../session/Panel";
import { CommitteeGraph } from "./CommitteeGraph";
import { Sparkline, Tape } from "./Tape";

const STEPS = [
  { title: "Figures first", text: "Prices, fundamentals and headlines are fetched, then every indicator (RSI, MACD, moving averages, volatility, beta, P/E) is calculated in Java before any model is called." },
  { title: "Three analysts argue", text: "Fundamentals and risk on Nemotron Super, technicals on Nemotron Nano, in parallel. Each takes a side and may only cite the figures it was given." },
  { title: "One rebuttal round", text: "If allowed, each analyst answers the colleague it disagrees with most. One round, then the floor closes." },
  { title: "The chair decides", text: "Nemotron Ultra weighs the arguments, calls BUY, HOLD or SELL with a confidence, and puts the strongest dissent on the record." },
];

const RULES = [
  { title: "Models don't do arithmetic", text: "They get a fact sheet computed in code and are told to quote from it, nothing else." },
  { title: "Every reply has a shape", text: "Answers must match a JSON schema generated from the Java records. A malformed reply gets one retry with the errors attached." },
  { title: "Every figure is traced", text: "Numbers an analyst cites are matched against its input. Untraceable evidence is thrown out; untraceable prose is flagged on the page." },
  { title: "The budget is hard", text: "Spend is checked before each call and kept across restarts. At the cap, saved sessions are served instead." },
];

/** "nemotron super" → "Nemotron Super": the status strip's labels, title-cased for display. */
const STATUS_LABEL: Record<string, string> = {
  clerk: "Clerk", "nemotron nano": "Nemotron Nano", "nemotron super": "Nemotron Super", "nemotron ultra": "Nemotron Ultra",
  roster: "Roster", "token factory": "Token Factory", "market cache": "Market data", guards: "Guards",
};

interface Props {
  config: AppConfig | null;
  health: Health | null;
  onConvene: (ticker: string, rebuttals: boolean) => void;
  onPage: (page: "record" | "compare") => void;
}

/**
 * The front door: what Zenith is, one box to convene the committee, the stocks already on file with their last
 * recorded close and latest call, and how the committee works. Nothing here pretends to be a live price.
 */
export function Landing({ config, health, onConvene, onPage }: Props) {
  const [tape, setTape] = useState<TapeRow[] | null>(null);
  const [line, setLine] = useState("");
  const [rebuttals, setRebuttals] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const agents = config?.agents ?? [];

  useEffect(() => {
    fetchTape().then(setTape);
  }, []);

  const suggest = useSymbolSuggest(line, (m) => onConvene(m.symbol, rebuttals));

  // The box takes a ticker or a company name, and quietly still understands the console's commands (record, compare,
  // --no-rebuttals). A name ("sandisk") that isn't a ticker in the suggestions goes to the best match (SNDK).
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const c = parseCommand(line);
    const best = suggest.matches[0];
    if (c.kind === "convene" && best && !suggest.matches.some((m) => m.symbol === c.ticker)) onConvene(best.symbol, c.rebuttals ?? rebuttals);
    else if (c.kind === "convene") onConvene(c.ticker, c.rebuttals ?? rebuttals);
    else if (c.kind === "page") onPage(c.page);
    else if (c.kind === "rebuttals") {
      setRebuttals(c.on);
      setLine("");
    } else if (c.kind === "error") setError(c.message);
    else setError("Type a US ticker or company name, e.g. NVDA or Sandisk, or pick a stock below.");
  };

  const boot = bootLines(agents, health, tape);
  const rows = tape ?? [];
  const latest = rows.map((r) => r.asOf).sort().at(-1);

  return (
    <main className="home">
      <Tape rows={rows} onOpen={(t) => onConvene(t, rebuttals)} />

      <section className="container hero2">
        <div className="hero2-copy">
          <p className="eyebrow"><i aria-hidden="true" /> Built on NVIDIA Nemotron · Nebius Token Factory</p>
          <h1>An AI investment committee <span className="grad">you can audit.</span></h1>
          <p className="lede">
            Three Nemotron analysts argue a stock from figures computed in code. A Nemotron Ultra chair calls BUY, HOLD or SELL
            and records the dissent. Every figure they quote is checked, and every call is scored against the S&amp;P&nbsp;500.
          </p>

          <div className="search-wrap">
            <form className="hero-search" onSubmit={submit} role="search">
              <SearchIcon />
              <label htmlFor="ticker" className="sr-only">Ticker or company name</label>
              <input id="ticker" value={line} onChange={(e) => { setLine(e.target.value); setError(null); suggest.setOpen(true); }}
                onKeyDown={suggest.onKeyDown} onFocus={() => suggest.setOpen(true)} onBlur={() => suggest.setOpen(false)}
                role="combobox" aria-expanded={suggest.shown} aria-controls="hero-suggest" aria-autocomplete="list"
                aria-activedescendant={suggest.active >= 0 ? `hero-suggest-${suggest.active}` : undefined}
                placeholder="Ticker or company, e.g. NVDA" maxLength={40} autoComplete="off" spellCheck={false} autoFocus />
              <button className="btn btn-primary" type="submit"><span>Convene<span className="hide-sm"> the committee</span></span></button>
            </form>
            {suggest.shown && <SuggestList id="hero-suggest" matches={suggest.matches} active={suggest.active} onPick={(m) => onConvene(m.symbol, rebuttals)} />}
          </div>
          {error && <p className="hero-error" role="alert">{error}</p>}
          <div className="hero-opts">
            <label className="switch">
              <input type="checkbox" checked={rebuttals} onChange={(e) => setRebuttals(e.target.checked)} />
              <span className="track" aria-hidden="true" />
              Rebuttal round
            </label>
            {rows.length > 0 && (
              <div className="quick">
                <span>Try</span>
                {rows.slice(0, 4).map((r) => <button key={r.ticker} type="button" className="chip" onClick={() => onConvene(r.ticker, rebuttals)}>{r.ticker}</button>)}
              </div>
            )}
          </div>
          <p className="hero-note">Research and education, not financial advice.{config?.demoMode && " Demo mode: only the stocks on file work."}</p>
        </div>
        {agents.length > 0 && <CommitteeGraph agents={agents} />}
      </section>

      <div className="container home-body">
        <ul className="status-strip" aria-label="System status">
          {boot.map((b) => (
            <li key={b.label} className={`st-${b.status}`}>
              <i aria-hidden="true" />
              <b>{STATUS_LABEL[b.label] ?? b.label}</b>
              <span>{b.detail}</span>
            </li>
          ))}
        </ul>

        <section className="home-sec" id="onfile">
          <header className="sec-head">
            <div>
              <h2>On file</h2>
              <p>Stocks the committee has already decided. Opening one replays its session at no cost.</p>
            </div>
            {latest && <span className="sec-meta">Last recorded close · {shortDate(latest)}</span>}
          </header>
          {tape === null ? (
            <div className="scards" aria-hidden="true">{[0, 1, 2, 3].map((i) => <div key={i} className="scard skel-card" />)}</div>
          ) : rows.length === 0 ? (
            <p className="dim">No stocks cached yet. Any ticker still works while live AI and market data are available.</p>
          ) : (
            <div className="scards">
              {rows.map((r) => (
                <button key={r.ticker} type="button" className="scard" onClick={() => onConvene(r.ticker, rebuttals)} title={`Open ${r.company}'s committee session`}>
                  <div className="scard-top">
                    <span className="q-logo sm" aria-hidden="true">{r.ticker.slice(0, 4)}</span>
                    <div className="scard-id"><b>{r.ticker}</b><span>{r.company}</span></div>
                    {r.lastCall && (
                      <span className={`call-pill call-${r.lastCall.call}`} title={`Decided ${when(r.lastCall.decidedAt)}`}>
                        {r.lastCall.call} <span className="num">{Math.round(r.lastCall.confidence * 100)}%</span>
                      </span>
                    )}
                  </div>
                  <div className="scard-px">
                    <span className="num">{r.close.toFixed(2)}</span>
                    <span className={`num ${toneOf(r.change) ?? ""}`}>{pct(r.change, true)}</span>
                  </div>
                  <Sparkline values={r.spark} width={240} height={44} />
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="home-sec" id="how">
          <header className="sec-head">
            <div>
              <h2>How a session works</h2>
              <p>From pressing Convene to reading the memo, usually about a minute.</p>
            </div>
          </header>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="step-n num">0{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="home-sec" id="rules">
          <header className="sec-head">
            <div>
              <h2>Built to be checked</h2>
              <p>An AI committee is only worth reading if you can check its working. These rules are enforced in code on every run.</p>
            </div>
          </header>
          <ul className="rule-cards">
            {RULES.map((r) => (
              <li key={r.title}>
                <span className="rule-ic" aria-hidden="true">✓</span>
                <h3>{r.title}</h3>
                <p>{r.text}</p>
              </li>
            ))}
          </ul>
        </section>

        {agents.length > 0 && (
          <section className="home-sec" id="committee">
            <header className="sec-head">
              <div>
                <h2>The seats</h2>
                <p>Reasoning is spent where it pays: Nano for narrow reads, Super for weighing evidence, one Ultra call for the judgement.</p>
              </div>
            </header>
            <div className="seat-cards">
              {agents.map((a) => (
                <div key={a.id} className={`seat-card id-${a.id}`}>
                  <div className="seat-top"><i className="id-mark" aria-hidden="true" /><b>{a.label}</b><TierTag tier={a.tier} /></div>
                  <code className="seat-model">{modelName(a.model) ?? "not configured"}</code>
                  <p>{a.why}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
