import { useEffect, useState } from "react";
import { fetchTrackRecord } from "../../api";
import type { AnalystName, CommitteeResult, Snapshot, TrackRecord } from "../../types";
import { ANALYSTS, ANALYST_TITLE, pct, shortDate } from "../../lib/format";
import { CostPanel } from "../committee/CostPanel";
import { Term } from "../ui/Term";

/** 1. Every number the models were allowed to use, computed in Java. */
function Computed({ snapshot }: { snapshot: Snapshot }) {
  const [open, setOpen] = useState<AnalystName>("fundamentals");
  const facts = snapshot.facts[open] ?? {};
  const total = ANALYSTS.reduce((n, a) => n + Object.keys(snapshot.facts[a] ?? {}).length, 0);
  return (
    <section className="proof-card">
      <header>
        <span className="proof-num">1</span>
        <div>
          <h3>Computed, not generated</h3>
          <p>{total} figures calculated in Java from market data dated {snapshot.asOf}. The models only interpret them.</p>
        </div>
      </header>
      <div className="seg" role="tablist" aria-label="Fact sheet">
        {ANALYSTS.map((a) => (
          <button key={a} role="tab" aria-selected={open === a} className={`id-${a}`} onClick={() => setOpen(a)}>
            <i className="id-mark" aria-hidden="true" />{ANALYST_TITLE[a]} <span className="dim num">{Object.keys(snapshot.facts[a] ?? {}).length}</span>
          </button>
        ))}
      </div>
      <dl className="factsheet num">
        {Object.entries(facts).map(([k, v]) => (
          <div key={k}><dt><Term label={k} /></dt><dd>{v}</dd></div>
        ))}
      </dl>
    </section>
  );
}

/** 2. The hallucination guard: what was checked, what was caught. */
function Guard({ result }: { result: CommitteeResult }) {
  const evidence = result.reports.reduce((n, r) => n + r.evidence.length, 0);
  const flagged = result.integrity.reduce((n, f) => n + f.figures.length, 0);
  const retried = result.costs.calls.filter((c) => c.attempt > 1).length;
  return (
    <section className="proof-card">
      <header>
        <span className="proof-num">2</span>
        <div>
          <h3>Hallucination guard</h3>
          <p>Every figure a model writes is matched against the numbers it was given, allowing only for rounding.</p>
        </div>
      </header>
      <div className={`guard-status ${flagged ? "has-flags" : "clean"}`}>
        <b className="num">{flagged ? `${flagged} untraced figure${flagged === 1 ? "" : "s"}` : "0 untraced figures"}</b>
        <span>{flagged ? "flagged in the minutes in red" : "in anything the committee said"}</span>
      </div>
      <ul className="guard-list">
        <li><b className="num">{evidence}</b> evidence values cited, all matched to a fact sheet (a mismatch is rejected and retried)</li>
        <li><b className="num">{retried}</b> model repl{retried === 1 ? "y" : "ies"} sent back for a retry this session</li>
        <li><b className="num">{result.reports.length + result.rebuttals.length + (result.decision ? 1 : 0)}</b> statements scanned for figures in the prose</li>
      </ul>
      {result.integrity.length > 0 && (
        <div className="guard-flags">
          {result.integrity.map((f) => (
            <div key={f.agent}><span className="dim">{f.agent}</span> {f.figures.map((x) => <mark key={x} className="fig fig-flagged">{x}</mark>)}</div>
          ))}
        </div>
      )}
    </section>
  );
}

/** 4. Accountability: every call is scored against the S&P 500 after the fact. */
function Record({ ticker, onOpenRecord }: { ticker: string; onOpenRecord: () => void }) {
  const [record, setRecord] = useState<TrackRecord | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchTrackRecord().then((r) => alive && setRecord(r)).catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [ticker]);

  const mine = record?.calls.filter((c) => c.call.ticker === ticker).slice(-3).reverse() ?? [];
  return (
    <section className="proof-card">
      <header>
        <span className="proof-num">4</span>
        <div>
          <h3>Held to account</h3>
          <p>Every live call goes on a ledger and is scored against SPY at 7, 30 and 90 days, right or wrong.</p>
        </div>
      </header>
      {failed ? (
        <p className="small dim">The track record couldn't be loaded.</p>
      ) : !record ? (
        <div className="skeleton" style={{ width: "70%" }} />
      ) : (
        <>
          <div className="record-tiles num">
            {record.summary.map((s) => (
              <div key={s.days}>
                <b>{s.winRate === null ? "–" : `${Math.round(s.winRate * 100)}%`}</b>
                <span>{s.days}-day · {s.scored ? `${s.correct}/${s.scored} right` : `${s.pending} pending`}</span>
              </div>
            ))}
          </div>
          {mine.length > 0 && (
            <ul className="record-mine num">
              {mine.map(({ call, outcomes }) => {
                const scored = outcomes.filter((o) => o.status === "scored");
                const last = scored[scored.length - 1];
                return (
                  <li key={call.id}>
                    <span className={`badge ${call.call}`}>{call.call}</span>
                    <span className="dim">{shortDate(call.decidedAt)}</span>
                    {last ? (
                      <span>{last.days}d: {pct(last.stockReturn, true)} vs SPY {pct(last.spyReturn, true)} · <b className={last.correct ? "pos" : "neg"}>{last.correct ? "right" : "wrong"}</b></span>
                    ) : (
                      <span className="dim">first score due {shortDate(outcomes[0]?.dueDate ?? call.decidedAt)}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <button className="linkish small" onClick={onOpenRecord}>Full track record ({record.calls.length} calls) →</button>
        </>
      )}
    </section>
  );
}

/** Why you can believe the committee: the maths, the guard, the bill and the scorecard, side by side. */
export function ProofPanel({ result, onOpenRecord }: { result: CommitteeResult; onOpenRecord: () => void }) {
  return (
    <section className="proof" id="proof" aria-labelledby="proof-h">
      <header className="proof-head">
        <h2 id="proof-h">Don't trust the committee. Check it.</h2>
        <p>Four things are enforced in code on every session, whatever the models say.</p>
      </header>
      <div className="proof-grid">
        <Computed snapshot={result.snapshot} />
        <Guard result={result} />
        <div className="proof-card proof-cost">
          <header>
            <span className="proof-num">3</span>
            <div>
              <h3>Right-sized models, visible bill</h3>
              <p>Nano for narrow reads, Super for weighing evidence, one Ultra call for the judgement.</p>
            </div>
          </header>
          <CostPanel costs={result.costs} />
        </div>
        <Record ticker={result.ticker} onOpenRecord={onOpenRecord} />
      </div>
    </section>
  );
}
