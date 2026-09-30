import type { Since } from "../../types";
import { pct, shortDate, toneOf } from "../../lib/format";
import { Panel } from "./Panel";

/** What keeps each call on track, in the track record's own terms. */
export function ruleFor(call: Since["call"], holdBandPct: number): string {
  if (call === "BUY") return "A BUY is on track while the stock is ahead of the S&P 500.";
  if (call === "SELL") return "A SELL is on track while the stock trails the S&P 500.";
  return `A HOLD is on track while the stock stays within ${holdBandPct} points of the S&P 500.`;
}

/**
 * How a saved ruling has aged: the stock and the S&P 500 since the close the committee saw, whether the call is on
 * track so far, and the technical figures then and now. All arithmetic on daily closes; nothing here is a model's view.
 */
export function SincePanel({ since }: { since: Since | null }) {
  if (!since) return null;
  if (since.tradingDays === 0) {
    return (
      <Panel title="Since this ruling" id="snc" meta={`ruled on the close of ${shortDate(since.asOf)}`}>
        <p className="dim small">No trading day has closed since the committee ruled, so there is nothing to mark yet.</p>
      </Panel>
    );
  }

  const days = `${since.tradingDays} trading day${since.tradingDays === 1 ? "" : "s"}`;
  return (
    <Panel title="Since this ruling" id="snc" className="since" meta={`${days} · close of ${shortDate(since.latestDate)}`}>
      <div className="since-grid">
        <div>
          <dl className="since-stats num">
            <div><dt>{since.ticker}</dt><dd className={toneOf(since.stockReturn)}>{pct(since.stockReturn, true)}</dd></div>
            <div><dt>S&amp;P 500</dt><dd className={toneOf(since.spyReturn)}>{since.spyReturn === null ? "n/a" : pct(since.spyReturn, true)}</dd></div>
            <div><dt>Difference</dt><dd className={toneOf(since.excess)}>{since.excess === null ? "n/a" : pct(since.excess, true)}</dd></div>
          </dl>
          {since.onTrack !== null && (
            <p className="since-mark">
              <span className={`call-pill ${since.onTrack ? "pos" : "neg"}`}>{since.onTrack ? "On track so far" : "Against the call so far"}</span>
              <span>{ruleFor(since.call, since.holdBandPct)} Calls are only scored at 7, 30 and 90 days.</span>
            </p>
          )}
        </div>
        <div>
          <table className="since-drift num">
            <thead><tr><th scope="col">Figure</th><th scope="col">At the ruling</th><th scope="col">Now</th></tr></thead>
            <tbody>
              {since.drift.map((d) => (
                <tr key={d.label}><th scope="row">{d.label}</th><td>{d.then}</td><td>{d.now}</td></tr>
              ))}
            </tbody>
          </table>
          {since.notes.length > 0 && (
            <ul className="since-notes">{since.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          )}
        </div>
      </div>
    </Panel>
  );
}
