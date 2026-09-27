import { useEffect, useState } from "react";
import { fetchTrackRecord } from "../../api";
import { money, pct, shortDate } from "../../lib/format";
import type { HorizonSummary, TrackOutcome, TrackRecord } from "../../types";

interface Props {
  onOpen: (ticker: string) => void;
}

/** The earliest date a still-pending window resolves, so an empty tile says when to come back. */
function nextDue(record: TrackRecord, days: number): string | null {
  const due = record.calls
    .map((c) => c.outcomes.find((o) => o.days === days))
    .filter((o): o is TrackOutcome => !!o && o.status === "pending")
    .map((o) => o.dueDate)
    .sort();
  return due[0] ?? null;
}

function HorizonTile({ s, record }: { s: HorizonSummary; record: TrackRecord }) {
  const due = nextDue(record, s.days);
  return (
    <div className="tile">
      <div className="tile-label">{s.days}-day calls</div>
      {s.winRate === null ? (
        <>
          <div className="tile-value tile-pending">Pending</div>
          <p className="tile-note">{due ? <>First result on <b>{shortDate(due)}</b></> : "No calls recorded yet"}</p>
        </>
      ) : (
        <>
          <div className="tile-value num">{Math.round(s.winRate * 100)}%</div>
          <p className="tile-note num">
            right on {s.correct} of {s.scored}
            {s.avgEdge !== null && <> · edge <span className={s.avgEdge >= 0 ? "pos" : "neg"}>{pct(s.avgEdge, true)}</span> vs SPY</>}
          </p>
        </>
      )}
      <div className="tile-meter" aria-hidden="true">
        <i style={{ width: `${(s.scored / Math.max(1, s.scored + s.pending)) * 100}%` }} />
      </div>
      <p className="tile-foot num">{s.scored} scored · {s.pending} pending</p>
    </div>
  );
}

function OutcomeCell({ o }: { o: TrackOutcome | undefined }) {
  if (!o) return <td />;
  if (o.status === "pending") return <td className="dim">due {shortDate(o.dueDate)}</td>;
  return (
    <td>
      <span className={`verdict-mark ${o.correct ? "right" : "wrong"}`}>{o.correct ? "Right" : "Wrong"}</span>
      <span className="num"> {pct(o.stockReturn, true)}</span>
      <span className="dim num"> vs {pct(o.spyReturn, true)}</span>
    </td>
  );
}

/**
 * Every decision the committee has made, scored against the S&P 500 at 7, 30 and 90 days.
 * Nothing here is backfilled: a call is scored only once its window has closed.
 */
export function TrackRecordPage({ onOpen }: Props) {
  const [record, setRecord] = useState<TrackRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Track record · Zenith";
    fetchTrackRecord().then(setRecord, (e: Error) => setError(e.message));
  }, []);

  return (
    <main className="container record">
      <header className="record-head">
        <div className="masthead"><span>Track record</span><span>Scored against the S&amp;P 500</span></div>
        <h1>Every call, kept and marked.</h1>
        <p className="lede">
          Each decision the chair makes is written down with the price at the time and checked against the market 7, 30 and
          90 days later. Nothing is deleted, re-scored or backfilled, so the record can only be earned.
        </p>
      </header>

      {error && <div className="notice error"><div>{error}</div></div>}
      {!record && !error && <p className="dim">Loading the record…</p>}

      {record && (
        <>
          <section className="tiles" aria-label="Results by window">
            {record.summary.map((s) => <HorizonTile key={s.days} s={s} record={record} />)}
          </section>

          <section className="doc-section record-rules">
            <header>
              <h2>How calls are marked</h2>
              <p>Against the market over the same window, so a rising market doesn't make every BUY look clever.</p>
            </header>
            <ul className="rules">
              <li><b>BUY is right</b> if the stock beat {record.benchmark} over the window.</li>
              <li><b>SELL is right</b> if the stock trailed {record.benchmark}.</li>
              <li><b>HOLD is right</b> if the stock stayed within {record.holdBandPct} percentage points of {record.benchmark}, either way.</li>
              <li><b>The clock starts</b> at the close of the trading day the committee's data came from, and stops at the first close on or after the due date. Returns exclude dividends.</li>
            </ul>
          </section>

          <section className="record-table">
            <h2 className="sr-only">All calls</h2>
            {record.calls.length === 0 ? (
              <div className="card"><div className="empty"><b>No calls on the record yet.</b>Convene the committee on a stock and its decision will appear here.</div></div>
            ) : (
              <div className="card">
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr><th>Decided</th><th>Stock</th><th>Call</th><th>Entry</th><th>7 days</th><th>30 days</th><th>90 days</th></tr>
                    </thead>
                    <tbody>
                      {record.calls.map(({ call, outcomes }) => (
                        <tr key={call.id}>
                          <td className="num">{shortDate(call.decidedAt)}</td>
                          <td>
                            <button type="button" className="ticker-link" onClick={() => onOpen(call.ticker)}>{call.ticker}</button>
                            <div className="xs dim">{call.company}</div>
                          </td>
                          <td><span className={`badge ${call.call}`}>{call.call}</span> <span className="xs dim num">{Math.round(call.confidence * 100)}%</span></td>
                          <td className="num">{money(call.entryClose, "USD")}<div className="xs dim">close {shortDate(call.asOf)}</div></td>
                          {[7, 30, 90].map((d) => <OutcomeCell key={d} o={outcomes.find((o) => o.days === d)} />)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {record.unavailable.length > 0 && (
              <p className="xs dim" style={{ marginTop: 8 }}>Prices couldn't be fetched for {record.unavailable.join(", ")}; their calls show as pending for now.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
