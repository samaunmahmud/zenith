import { useEffect, useState, type FormEvent } from "react";
import { usePlayback, type Playback } from "../../hooks/usePlayback";
import { useSession } from "../../hooks/useSession";
import { secs, usd } from "../../lib/format";
import { statusAt } from "../../lib/tape";
import type { CommitteeState } from "../../state/committee";
import type { ChairDecision } from "../../types";
import { Term } from "../ui/Term";
import { Panel, clock } from "../session/Panel";
import { StanceBoard } from "../session/StanceBoard";
import { Timeline } from "../session/Timeline";
import { VerdictPanel } from "../session/VerdictPanel";
import { metricRows, preferred } from "./matrix";

interface Props {
  onFile: string[];
  onOpen: (ticker: string) => void;
}

const params = () => new URLSearchParams(window.location.search);
const clean = (t: string) => t.trim().toUpperCase();
const duration = (s: CommitteeState) => {
  const r = s.timing.run;
  return r?.start !== undefined && r.end !== undefined ? r.end - r.start : null;
};

/** The chair's ruling once the tape has reached it (never before), as on the session screen. */
function ruling(s: CommitteeState, play: Playback): ChairDecision | null {
  const chair = play.tape.procs.find((p) => p.id === "chair");
  return chair && statusAt(chair, play.t) === "done" ? s.decision : null;
}

/** One side: the company, then the same ruling, stances and pipeline as a full session. */
function Side({ s, play, side, onOpen }: { s: CommitteeState; play: Playback; side: "a" | "b"; onOpen: (t: string) => void }) {
  const decision = ruling(s, play);
  const running = !play.finished && s.status !== "error";
  return (
    <section className="cside" aria-label={`${s.ticker} committee`}>
      <header className="cside-head">
        <div className="q-id">
          <span className="q-logo" aria-hidden="true">{s.ticker.slice(0, 4)}</span>
          <div className="q-names">
            <h2 className="q-name">{s.snapshot?.companyName ?? (s.status === "error" ? s.ticker : "Loading…")}</h2>
            <p className="q-meta"><b className="q-sym">{s.ticker}</b>{s.snapshot?.sector && <> · {s.snapshot.sector}</>}</p>
          </div>
        </div>
        <div className="q-session">
          <span className={`q-mode ${play.mode === "live" ? "is-live" : "is-replay"} ${running ? "is-running" : ""}`}>
            <i aria-hidden="true" />{play.mode === "live" ? "Live" : `Replay ×${play.speed.toFixed(1)}`}
            <span className="q-clock num" aria-hidden="true">{clock(play.t)}</span>
          </span>
          {play.mode === "replay" && !play.finished && <button className="tbtn" onClick={play.skip}>Skip</button>}
          {decision && play.finished && <button className="tbtn" onClick={() => onOpen(s.ticker)}>Full session →</button>}
        </div>
      </header>
      {s.status === "error" && play.finished && <div className="notice error"><div>{s.error}</div></div>}
      <VerdictPanel state={s} play={play} decision={decision} id={`rul-${side}`} compact />
      <StanceBoard state={s} play={play} decision={decision} id={`vot-${side}`} />
      <Timeline play={play} id={`tl-${side}`} />
    </section>
  );
}

/**
 * Head to head: two committees sit at the same time, one per stock, and the results are laid out side by side.
 * Each side is an ordinary session (same gate, same reuse, same budget), so a pair decided recently costs nothing.
 */
export function ComparePage({ onFile, onOpen }: Props) {
  const left = useSession();
  const right = useSession();
  const lp = usePlayback(left.state);
  const rp = usePlayback(right.state);
  const [a, setA] = useState(() => clean(params().get("a") ?? ""));
  const [b, setB] = useState(() => clean(params().get("b") ?? ""));
  const started = left.state.status !== "idle";
  const running = left.state.status === "running" || right.state.status === "running";

  const convene = (x: string, y: string) => {
    const ta = clean(x);
    const tb = clean(y);
    if (!ta || !tb || ta === tb || running) return;
    setA(ta);
    setB(tb);
    window.history.replaceState(null, "", `?${new URLSearchParams({ page: "compare", a: ta, b: tb })}`);
    left.start(ta);
    right.start(tb);
  };

  // A shared comparison link starts on arrival. No run-once guard: each useSession closes its stream on unmount, so a
  // remount (React StrictMode does one in dev) has to start the pair again rather than leave both sides hanging.
  useEffect(() => {
    document.title = "Head to head · Zenith";
    if (a && b) convene(a, b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    convene(a, b);
  };

  // The comparison is laid out once both tapes have played to the end, not the moment the data arrives.
  const done = !running && lp.finished && rp.finished && Boolean(ruling(left.state, lp) && ruling(right.state, rp));
  const pick = done ? preferred(left.state, right.state) : null;
  const rows = done ? metricRows(left.state, right.state) : [];
  const pairs = onFile.length >= 2 ? [[onFile[0], onFile[1]], ...(onFile.length >= 4 ? [[onFile[2], onFile[3]]] : [])] : [];

  const da = duration(left.state);
  const db = duration(right.state);
  const bothLive = done && !left.state.result?.replayed && !right.state.result?.replayed && da !== null && db !== null;
  const wall = bothLive ? Math.max(left.state.timing.run!.end!, right.state.timing.run!.end!) - Math.min(left.state.timing.run!.start!, right.state.timing.run!.start!) : null;
  const cost = (left.state.result?.costs.totalUsd ?? 0) + (right.state.result?.costs.totalUsd ?? 0);
  const winner = pick === "a" ? left.state : pick === "b" ? right.state : null;
  const loser = pick === "a" ? right.state : pick === "b" ? left.state : null;

  return (
    <main className="tx">
      <div className="container tx-body">
        <header className="page-head">
          <p className="eyebrow"><i aria-hidden="true" /> Head to head · two committees in parallel on Nebius Token Factory</p>
          <h1>Two stocks. Two committees. <span className="grad">One screen.</span></h1>
          <p className="lede">
            Each stock gets its own full committee, running at the same time. Then the calls, the key figures and the risks
            are laid side by side. Research and education, not financial advice.
          </p>
        </header>

        <form className="versus2" onSubmit={submit}>
          <label className="sr-only" htmlFor="ta">First ticker</label>
          <input id="ta" value={a} onChange={(e) => setA(e.target.value)} placeholder="NVDA" maxLength={10} autoComplete="off" spellCheck={false} disabled={running} />
          <span className="vs-sep" aria-hidden="true">vs</span>
          <label className="sr-only" htmlFor="tb">Second ticker</label>
          <input id="tb" value={b} onChange={(e) => setB(e.target.value)} placeholder="AMD" maxLength={10} autoComplete="off" spellCheck={false} disabled={running} />
          <button className="btn btn-primary" type="submit" disabled={running || !clean(a) || !clean(b) || clean(a) === clean(b)}>
            {running ? "In session…" : "Convene both"}
          </button>
        </form>
        <div className="hero-opts">
          {pairs.length > 0 && (
            <div className="quick">
              <span>On file</span>
              {pairs.map(([x, y]) => (
                <button key={x + y} type="button" className="chip" disabled={running} onClick={() => convene(x, y)}>{x} vs {y}</button>
              ))}
            </div>
          )}
          <span className="hero-note">About 4¢ for a pair with no recent saved decision; free otherwise.</span>
        </div>

        {started && (
          <div className="csides">
            <Side s={left.state} play={lp} side="a" onOpen={onOpen} />
            <Side s={right.state} play={rp} side="b" onOpen={onOpen} />
          </div>
        )}

        {done && (
          <>
            <Panel title="The committees' preference" id="pref" className="cpref" meta="ranked in code, not by a model">
              {winner && loser ? (
                <p className="cpref-line">
                  <b className="q-sym">{winner.ticker}</b>{" "}
                  <span className={`call-${winner.decision!.recommendation}`}>{winner.decision!.recommendation} {Math.round(winner.decision!.confidence * 100)}%</span>
                  <span className="dim"> over </span>
                  <b className="q-sym">{loser.ticker}</b>{" "}
                  <span className={`call-${loser.decision!.recommendation}`}>{loser.decision!.recommendation} {Math.round(loser.decision!.confidence * 100)}%</span>
                </p>
              ) : (
                <p className="cpref-line"><b>No clear preference.</b> <span className="dim">Both committees reached the same call with the same confidence.</span></p>
              )}
              <p className="xs dim">The stronger call wins (BUY, then HOLD, then SELL), then the chair's confidence. Not advice.</p>
            </Panel>

            <Panel title="Key figures side by side" id="matrix" meta="better value highlighted where one direction is better">
              <div className="table-scroll">
                <table className="ptable cmatrix">
                  <caption className="sr-only">Key figures side by side</caption>
                  <thead>
                    <tr><th>Figure</th><th className="num">{left.state.ticker}</th><th className="num">{right.state.ticker}</th><th className="hide-sm">Better when</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.label}>
                        <td className="cm-label"><Term label={r.term ?? r.label} /></td>
                        <td className={`num ${r.edge === "a" ? "is-edge" : ""}`}>{r.a}</td>
                        <td className={`num ${r.edge === "b" ? "is-edge" : ""}`}>{r.b}</td>
                        <td className="dim hide-sm">{r.better ?? "depends"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <div className="csides">
              {[left.state, right.state].map((s, i) => (
                <Panel key={s.ticker} title={`${s.ticker}: what could go wrong`} id={`risk-${i}`}>
                  <ul className="checks">
                    {s.decision!.keyRisks.map((k) => <li key={k} className="warn"><span className="chk">!</span><span>{k}</span></li>)}
                  </ul>
                </Panel>
              ))}
            </div>

            <p className="cfoot num">
              {wall !== null && da !== null && db !== null ? (
                <>Both committees ran in parallel: <b>{secs(wall)}</b> instead of {secs(da + db)} one after the other. </>
              ) : null}
              Model cost for the pair: <b>{usd(cost)}</b>{left.state.result?.replayed || right.state.result?.replayed ? " (what the saved sessions cost when they were decided)" : ""}.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
