import { useEffect, useState } from "react";
import { fetchTrackRecord } from "../../api";
import { money, pct, shortDate } from "../../lib/format";
import type { HorizonSummary, TrackOutcome, TrackRecord } from "../../types";
import { Panel } from "../session/Panel";

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
    <Panel title={`${s.days}-day calls`} id={`h${s.days}`} className="rtile" meta={<span className="num">{s.scored} scored · {s.pending} pending</span>}>
      {s.winRate === null ? (
        <>
          <div className="rtile-value is-pending">Pending</div>
          <p className="rtile-note">{due ? <>First result on <b>{shortDate(due)}</b></> : "No calls recorded yet"}</p>
        </>
      ) : (
        <>
          <div className="rtile-value num">{Math.round(s.winRate * 100)}%</div>
          <p className="rtile-note num">
            right on {s.correct} of {s.scored}
            {s.avgEdge !== null && <> · edge <span className={s.avgEdge >= 0 ? "pos" : "neg"}>{pct(s.avgEdge, true)}</span> vs SPY</>}
          </p>
        </>
      )}
      <span className="pbar rtile-meter" aria-hidden="true">
        <i style={{ width: `${(s.scored / Math.max(1, s.scored + s.pending)) * 100}%` }} />
      </span>
    </Panel>
  );
}

function OutcomeCell({ o }: { o: TrackOutcome | undefined }) {
  if (!o) return <td />;
  if (o.status === "pending") return <td className="dim">due {shortDate(o.dueDate)}</td>;
  return (
    <td>
      <span className={`rmark ${o.correct ? "pos" : "neg"}`}>{o.correct ? "✓ Right" : "✗ Wrong"}</span>
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
    <main className="tx">
      <div className="container tx-body">
        <header className="page-head">
          <p className="eyebrow"><i aria-hidden="true" /> Track record · scored against the S&amp;P 500</p>
          <h1>Every call, kept and <span className="grad">marked.</span></h1>
          <p className="lede">
            Each decision the chair makes is written down with the price at the time and checked against the market 7, 30 and
            90 days later. Nothing is deleted, re-scored or backfilled, so the record can only be earned.
          </p>
        </header>

        {error && <div className="notice error"><div>{error}</div></div>}
        {!record && !error && <p className="dim">Loading the record…</p>}

        {record && (
          <>
            <section className="rtiles" aria-label="Results by window">
              {record.summary.map((s) => <HorizonTile key={s.days} s={s} record={record} />)}
            </section>

            <Panel title="The ledger" id="ledger" meta={<span className="num">{record.calls.length} calls · append-only</span>}>
              {record.calls.length === 0 ? (
                <p className="dim">No calls on the record yet. Convene the committee on a stock and its decision will appear here.</p>
              ) : (
                <div className="table-scroll">
                  <table className="ptable rledger">
                    <thead>
                      <tr><th>Decided</th><th>Stock</th><th>Call</th><th className="num">Entry</th><th>7 days</th><th>30 days</th><th>90 days</th></tr>
                    </thead>
                    <tbody>
                      {record.calls.map(({ call, outcomes }) => (
                        <tr key={call.id}>
                          <td className="dim">{shortDate(call.decidedAt)}</td>
                          <td>
                            <button type="button" className="wl-sym" onClick={() => onOpen(call.ticker)} title={`Open ${call.company}'s committee session`}>{call.ticker}</button>
                            <span className="wl-co">{call.company}</span>
                          </td>
                          <td><span className={`call-pill call-${call.call}`}>{call.call} <span className="num">{Math.round(call.confidence * 100)}%</span></span></td>
                          <td className="num">{money(call.entryClose, "USD")}<span className="wl-co">close {shortDate(call.asOf)}</span></td>
                          {[7, 30, 90].map((d) => <OutcomeCell key={d} o={outcomes.find((o) => o.days === d)} />)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {record.unavailable.length > 0 && (
                <p className="xs dim" style={{ marginTop: 10 }}>Prices couldn't be fetched for {record.unavailable.join(", ")}; their calls show as pending for now.</p>
              )}
            </Panel>

            <Panel title="How calls are marked" id="marking" meta={`against ${record.benchmark} over the same window`}>
              <ul className="checks">
                <li className="ok"><span className="chk">✓</span><span><b>BUY is right</b> if the stock beat {record.benchmark} over the window.</span></li>
                <li className="ok"><span className="chk">✓</span><span><b>SELL is right</b> if the stock trailed {record.benchmark}.</span></li>
                <li className="ok"><span className="chk">✓</span><span><b>HOLD is right</b> if the stock stayed within {record.holdBandPct} percentage points of {record.benchmark}, either way.</span></li>
                <li className="ok"><span className="chk">✓</span><span><b>The clock starts</b> at the close of the trading day the committee's data came from, and stops at the first close on or after the due date. Returns exclude dividends.</span></li>
              </ul>
            </Panel>
          </>
        )}
      </div>
    </main>
  );
}
