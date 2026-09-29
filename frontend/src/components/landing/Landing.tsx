import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { fetchTape } from "../../api";
import type { AppConfig, Health, TapeRow } from "../../types";
import { bootLines, HELP, parseCommand } from "../../lib/console";
import { pct, toneOf, when } from "../../lib/format";
import { modelName } from "../boardroom/BoardTable";
import { Panel, TierTag } from "../terminal/Panel";
import { Sparkline, Tape } from "./Tape";

const PIPELINE: { code: string; title: string; text: ReactNode }[] = [
  { code: "01", title: "Figures first", text: "Prices, fundamentals and headlines are fetched, then every indicator (RSI, MACD, moving averages, volatility, beta, P/E) is calculated in Java before any model is called." },
  { code: "02", title: "Opening positions", text: "Fundamentals and risk on Nemotron Super, technicals on Nemotron Nano, in parallel. Each takes a side and may only cite the figures it was given." },
  { code: "03", title: "One rebuttal", text: "If allowed, each analyst answers the colleague it disagrees with most. One round, then the floor closes." },
  { code: "04", title: "The chair's call", text: "Nemotron Ultra weighs the arguments, calls BUY, HOLD or SELL with a confidence, and puts the strongest dissent on the record." },
];

const RULES = [
  { title: "Models don't do arithmetic.", text: "They get a fact sheet computed in code and are told to quote from it, nothing else." },
  { title: "Every reply has a shape.", text: "Answers must match a JSON schema generated from the Java records. A malformed reply gets one retry with the errors attached, never two." },
  { title: "Every figure is traced.", text: "Numbers an analyst cites are matched against its input, allowing for rounding. Untraceable evidence is thrown out; untraceable prose is flagged." },
  { title: "The budget is hard.", text: "Spend is checked before each call and kept across restarts. At the cap, the committee stops meeting and saved sessions are served instead." },
];

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** One thing printed in the console after the boot checks: an echoed command and what it answered. */
type Out = { id: number; cmd: string; lines: { text: string; tone?: "err" | "ok" | "dim" }[]; help?: boolean };

interface Props {
  config: AppConfig | null;
  health: Health | null;
  onConvene: (ticker: string, rebuttals: boolean) => void;
  onPage: (page: "record" | "compare") => void;
}

/**
 * The front door as a terminal: start-up checks stated from the real config, a command line that convenes the
 * committee, and the stocks on file with their last recorded close. Nothing here pretends to be a live price.
 */
export function Landing({ config, health, onConvene, onPage }: Props) {
  const [tape, setTape] = useState<TapeRow[] | null>(null);
  const [line, setLine] = useState("");
  const [rebuttals, setRebuttals] = useState(true);
  const [out, setOut] = useState<Out[]>([]);
  const [shown, setShown] = useState(() => (reducedMotion() ? 99 : 0));
  const input = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  const agents = config?.agents ?? [];

  useEffect(() => {
    fetchTape().then(setTape);
  }, []);

  const boot = bootLines(agents, health, tape);
  // Boot lines print one at a time; the prompt works throughout, nobody has to wait for the show.
  useEffect(() => {
    if (shown >= boot.length) return;
    const id = window.setTimeout(() => setShown((n) => n + 1), shown === 0 ? 250 : 120);
    return () => window.clearTimeout(id);
  }, [shown, boot.length]);
  const booted = shown >= boot.length;

  const print = (cmd: string, lines: Out["lines"], help = false) =>
    setOut((o) => [...o.slice(-5), { id: nextId.current++, cmd, lines, help }]);

  const run = (raw: string) => {
    const c = parseCommand(raw);
    switch (c.kind) {
      case "none":
        return;
      case "clear":
        setOut([]);
        break;
      case "help":
        print(raw, [], true);
        break;
      case "rebuttals":
        setRebuttals(c.on);
        print(raw, [{ text: `rebuttal round ${c.on ? "on" : "off"} for every run`, tone: "ok" }]);
        break;
      case "page":
        onPage(c.page);
        return;
      case "error":
        print(raw, [{ text: c.message, tone: "err" }]);
        break;
      case "convene":
        onConvene(c.ticker, c.rebuttals ?? rebuttals);
        return;
    }
    setLine("");
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(line);
  };

  const rows = tape ?? [];
  const live = boot.find((b) => b.label === "token factory")?.status === "ok";

  return (
    <main className="tx tland">
      <Tape rows={rows} onOpen={(t) => onConvene(t, rebuttals)} />
      <div className="container tx-body">
        <header className="tland-head">
          <p className="tland-kicker"><span className="tpanel-code">ZNTH</span> AI investment committee · Nebius Token Factory · NVIDIA Nemotron</p>
          <h1>Three analysts argue. A chair decides. <em>Every figure is checked.</em></h1>
          <p className="tland-lede">
            Type a ticker. Nemotron analysts take opposing sides on fundamentals, technicals and risk, a Nemotron Ultra chair
            calls BUY, HOLD or SELL with the dissent on the record, and every call is later scored against the S&amp;P&nbsp;500.
            Research and education, not financial advice.
          </p>
        </header>

        <div className="tgrid">
          <Panel code="CMD" title="Committee console" id="console" className="tconsole"
            meta={<span className={`q-mode ${live ? "is-live" : "is-replay"}`}><i aria-hidden="true" />{live ? "LIVE AI" : "SAVED ONLY"}</span>}>
            <div className="con" onClick={() => input.current?.focus()}>
              <p className="con-dim">zenith v1 · research and education, not financial advice</p>
              <ul className="boot" aria-label="Start-up checks">
                {boot.slice(0, shown).map((b) => (
                  <li key={b.label} className={`boot-${b.status}`}>
                    <span className="boot-st">{b.status === "ok" ? "[ OK ]" : b.status === "warn" ? "[WARN]" : "[ .. ]"}</span>
                    <span className="boot-lbl">{b.label}</span>
                    <span className="boot-detail">{b.detail}</span>
                  </li>
                ))}
              </ul>
              {booted && <p className="con-ready">ready. type a ticker and press enter, or <button type="button" className="con-link" onClick={() => run("help")}>help</button>.</p>}

              {out.map((o) => (
                <div key={o.id} className="con-out">
                  <p className="con-echo"><span className="con-ps">❯</span> {o.cmd}</p>
                  {o.lines.map((l, i) => <p key={i} className={`con-${l.tone ?? "line"}`}>{l.text}</p>)}
                  {o.help && (
                    <dl className="con-help">
                      {HELP.map(([cmd, what]) => (
                        <div key={cmd}><dt>{cmd}</dt><dd>{what}</dd></div>
                      ))}
                    </dl>
                  )}
                </div>
              ))}

              <form className="con-prompt" onSubmit={submit} role="search">
                <label htmlFor="ticker" className="con-ps">❯<span className="sr-only">Ticker or command</span></label>
                <input id="ticker" ref={input} value={line} onChange={(e) => setLine(e.target.value)} placeholder="AAPL"
                  maxLength={40} autoComplete="off" autoCapitalize="characters" spellCheck={false} autoFocus />
                <button className="tbtn tbtn-go" type="submit" disabled={!line.trim()}>Convene ⏎</button>
              </form>
            </div>
            <div className="con-foot">
              <label className="switch">
                <input type="checkbox" checked={rebuttals} onChange={(e) => setRebuttals(e.target.checked)} />
                <span className="track" aria-hidden="true" />
                Rebuttal round
              </label>
              {config?.demoMode && <span className="xs dim">Demo mode: only the stocks on file work.</span>}
              <span className="con-keys dim">try <kbd>NVDA --no-rebuttals</kbd> · <kbd>record</kbd></span>
            </div>
          </Panel>

          <Panel code="WL" title="On file" id="onfile" meta="last recorded close · latest call">
            {tape === null ? (
              <p className="dim xs">Reading the cache…</p>
            ) : rows.length === 0 ? (
              <p className="dim xs">No stocks cached yet. Any ticker still works while live AI and market data are available.</p>
            ) : (
              <div className="table-scroll">
                <table className="ptable wl">
                  <thead>
                    <tr><th>Sym</th><th className="num">Last</th><th className="num">Chg</th><th className="hide-sm">30d</th><th>Call</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.ticker} onClick={() => onConvene(r.ticker, rebuttals)}>
                        <td>
                          <button type="button" className="wl-sym" onClick={(e) => { e.stopPropagation(); onConvene(r.ticker, rebuttals); }}
                            title={`Open ${r.company}'s committee session`}>{r.ticker}</button>
                          <span className="wl-co">{r.company}</span>
                        </td>
                        <td className="num" title={`Close on ${r.asOf}`}>{r.close.toFixed(2)}</td>
                        <td className={`num ${toneOf(r.change) ?? ""}`}>{pct(r.change, true)}</td>
                        <td className="hide-sm"><Sparkline values={r.spark} /></td>
                        <td>
                          {r.lastCall ? (
                            <span className={`wl-call call-${r.lastCall.call}`} title={`Decided ${when(r.lastCall.decidedAt)}`}>
                              {r.lastCall.call} <span className="num">{Math.round(r.lastCall.confidence * 100)}%</span>
                            </span>
                          ) : <span className="dim">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <div className="tgrid tland-docs">
          <Panel code="SEQ" title="Order of business" id="how" meta="about a minute, end to end">
            <ol className="seq">
              {PIPELINE.map((p) => (
                <li key={p.code}>
                  <span className="seq-n num">{p.code}</span>
                  <div><b>{p.title}</b><p>{p.text}</p></div>
                </li>
              ))}
            </ol>
          </Panel>
          <Panel code="RUL" title="Standing rules" id="rules" meta="enforced in code, every run">
            <ul className="checks">
              {RULES.map((r) => (
                <li key={r.title} className="ok"><span className="chk">✓</span><span><b>{r.title}</b> {r.text}</span></li>
              ))}
            </ul>
          </Panel>
        </div>

        {agents.length > 0 && (
          <Panel code="SEAT" title="The seats" id="committee" meta="Nano for narrow reads · Super to weigh evidence · one Ultra call to judge">
            <div className="table-scroll">
              <table className="ptable seats">
                <thead><tr><th>Seat</th><th>Model</th><th>Why this size</th></tr></thead>
                <tbody>
                  {agents.map((a) => (
                    <tr key={a.id} className={`id-${a.id}`}>
                      <td className="p-who"><i className="id-mark" aria-hidden="true" />{a.label}</td>
                      <td className="p-model"><TierTag tier={a.tier} /><span>{modelName(a.model) ?? "not configured"}</span></td>
                      <td className="seat-why">{a.why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </div>
    </main>
  );
}
