import { useEffect, useState, type FormEvent } from "react";
import { useMeeting, type Meeting } from "../../hooks/useMeeting";
import { useSession } from "../../hooks/useSession";
import { ANALYSTS, ANALYST_TITLE, secs, usd } from "../../lib/format";
import type { CommitteeState } from "../../state/committee";
import type { AgentModel } from "../../types";
import { BoardTable } from "../boardroom/BoardTable";
import { Term } from "../ui/Term";
import { metricRows, preferred } from "./matrix";

interface Props {
  agents: AgentModel[];
  onFile: string[];
  onOpen: (ticker: string) => void;
}

const params = () => new URLSearchParams(window.location.search);
const clean = (t: string) => t.trim().toUpperCase();
const duration = (s: CommitteeState) => {
  const r = s.timing.run;
  return r?.start !== undefined && r.end !== undefined ? r.end - r.start : null;
};

/** One side: its own small boardroom, then the ruling in words once the chair's stamp has landed. */
function Side({ s, m, agents, onOpen }: { s: CommitteeState; m: Meeting; agents: AgentModel[]; onOpen: (t: string) => void }) {
  const d = m.decision;
  return (
    <article className="side card">
      <header className="side-head">
        <div>
          <h2>{s.ticker}</h2>
          <p className="small muted">{s.snapshot?.companyName ?? " "}</p>
        </div>
        {d && <button type="button" className="btn btn-sm" onClick={() => onOpen(s.ticker)}>Full session</button>}
      </header>
      <div className="card-body stack">
        <div className="board-compact">
          <BoardTable agents={s.agents.length ? s.agents : agents} states={m.states} said={m.said} caption={m.caption} decision={d} />
        </div>
        {s.status === "error" && !m.pending ? (
          <div className="notice error"><div>{s.error}</div></div>
        ) : d ? (
          <div className="side-ruling">
            <p className="side-summary">{d.summary}</p>
            <ul className="side-stances">
              {ANALYSTS.map((a) => {
                const r = s.reports[a];
                return (
                  <li key={a} className={`id-${a}`}>
                    <i className="id-mark" aria-hidden="true" />{ANALYST_TITLE[a]}
                    <span className={r ? `badge ${r.stance}` : "badge"}>{r ? r.stance : "no report"}</span>
                  </li>
                );
              })}
            </ul>
            {s.result?.replayed && <p className="xs dim">Decided recently, so this is the saved session (no new cost).</p>}
          </div>
        ) : null}
      </div>
    </article>
  );
}

/**
 * Head to head: two committees sit at the same time, one per stock, and the results are laid out side by side.
 * Each side is an ordinary session (same gate, same reuse, same budget), so a pair decided recently costs nothing.
 */
export function ComparePage({ agents, onFile, onOpen }: Props) {
  const left = useSession();
  const right = useSession();
  const lm = useMeeting(left.state);
  const rm = useMeeting(right.state);
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

  // The comparison is laid out once both stamps have landed, not the moment the data arrives.
  const done = lm.decision && rm.decision && !running && !lm.pending && !rm.pending;
  const pick = done ? preferred(left.state, right.state) : null;
  const rows = done ? metricRows(left.state, right.state) : [];
  const pairs = onFile.length >= 2 ? [[onFile[0], onFile[1]], ...(onFile.length >= 4 ? [[onFile[2], onFile[3]]] : [])] : [];

  const da = duration(left.state);
  const db = duration(right.state);
  const bothLive = done && !left.state.result?.replayed && !right.state.result?.replayed && da !== null && db !== null;
  const wall = bothLive ? Math.max(left.state.timing.run!.end!, right.state.timing.run!.end!) - Math.min(left.state.timing.run!.start!, right.state.timing.run!.start!) : null;
  const cost = (left.state.result?.costs.totalUsd ?? 0) + (right.state.result?.costs.totalUsd ?? 0);

  return (
    <main className="container compare">
      <header className="record-head">
        <div className="masthead"><span>Head to head</span><span>Two committees, sitting at once</span></div>
        <h1>Put two stocks on trial.</h1>
        <p className="lede">
          Each stock gets its own full committee, running in parallel on Nebius Token Factory. Then the calls, the evidence
          and the risks are laid side by side.
        </p>
      </header>

      <form className="versus" onSubmit={submit}>
        <label className="sr-only" htmlFor="ta">First ticker</label>
        <input id="ta" value={a} onChange={(e) => setA(e.target.value)} placeholder="NVDA" maxLength={10} autoComplete="off" spellCheck={false} disabled={running} />
        <span className="vs" aria-hidden="true">vs</span>
        <label className="sr-only" htmlFor="tb">Second ticker</label>
        <input id="tb" value={b} onChange={(e) => setB(e.target.value)} placeholder="AMD" maxLength={10} autoComplete="off" spellCheck={false} disabled={running} />
        <button className="btn btn-primary" type="submit" disabled={running || !clean(a) || !clean(b) || clean(a) === clean(b)}>
          {running ? "In session…" : "Convene both"}
        </button>
      </form>
      <div className="convene-meta">
        {pairs.length > 0 && (
          <div className="recent">
            <span>On file</span>
            {pairs.map(([x, y]) => (
              <button key={x + y} type="button" className="ticker-link" disabled={running} onClick={() => convene(x, y)}>{x} vs {y}</button>
            ))}
          </div>
        )}
        <span className="xs dim">About 4¢ for two stocks with no recent saved decision; free otherwise.</span>
      </div>

      {started && (
        <section className="sides" aria-label="The two committees">
          <Side s={left.state} m={lm} agents={agents} onOpen={onOpen} />
          <Side s={right.state} m={rm} agents={agents} onOpen={onOpen} />
        </section>
      )}

      {done && (
        <>
          <section className={`pick ${pick ? "" : "is-even"}`}>
            <div className="label">The committees' preference</div>
            {pick ? (
              <p>
                <b>{(pick === "a" ? left : right).state.ticker}</b>: a {(pick === "a" ? left : right).state.decision!.recommendation} at{" "}
                {Math.round((pick === "a" ? left : right).state.decision!.confidence * 100)}% confidence, against{" "}
                {(pick === "a" ? right : left).state.decision!.recommendation} at {Math.round((pick === "a" ? right : left).state.decision!.confidence * 100)}%
                for {(pick === "a" ? right : left).state.ticker}.
              </p>
            ) : (
              <p><b>No clear preference.</b> Both committees reached the same call with the same confidence.</p>
            )}
            <p className="xs dim">Ranked in code: the stronger call wins (BUY, then HOLD, then SELL), then the chair's confidence. Not advice.</p>
          </section>

          <section className="card">
            <div className="table-wrap">
              <table className="table matrix">
                <caption className="sr-only">Key figures side by side</caption>
                <thead>
                  <tr><th>Figure</th><th>{left.state.ticker}</th><th>{right.state.ticker}</th><th>Better when</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label}>
                      <td><Term label={r.term ?? r.label} /></td>
                      <td className={`num ${r.edge === "a" ? "is-edge" : ""}`}>{r.a}{r.edge === "a" && <span className="edge-tag">better</span>}</td>
                      <td className={`num ${r.edge === "b" ? "is-edge" : ""}`}>{r.b}{r.edge === "b" && <span className="edge-tag">better</span>}</td>
                      <td className="dim small">{r.better ?? "depends"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="sides">
            {[left.state, right.state].map((s) => (
              <div className="card" key={s.ticker}>
                <div className="card-head"><h2>{s.ticker}: what could go wrong</h2></div>
                <div className="card-body stack">
                  <ul className="events">{s.decision!.keyRisks.map((k) => <li key={k}>{k}</li>)}</ul>
                  {s.decision!.dissent && (
                    <div className="dissent">
                      <div className="label">Dissent · {ANALYST_TITLE[s.decision!.dissent.analyst]}</div>
                      <p>{s.decision!.dissent.argument}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </section>

          <p className="compare-foot small muted num">
            {wall !== null && da !== null && db !== null ? (
              <>Both committees ran in parallel: <b>{secs(wall)}</b> instead of {secs(da + db)} one after the other. </>
            ) : null}
            Model cost for the pair: <b>{usd(cost)}</b>{left.state.result?.replayed || right.state.result?.replayed ? " (what the saved sessions cost when they were decided)" : ""}.
          </p>
        </>
      )}
    </main>
  );
}
