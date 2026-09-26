import type { CommitteeState } from "../../state/committee";
import { when } from "../../lib/format";

/** One-click alternatives: tickers the committee has already decided, which replay at no cost. */
function OnFile({ tickers, current, onConvene }: { tickers: string[]; current: string; onConvene: (t: string) => void }) {
  const others = tickers.filter((t) => t !== current);
  if (!others.length) return null;
  return (
    <div className="on-file">
      <span>Decisions on file:</span>
      {others.map((t) => <button key={t} type="button" className="ticker-link" onClick={() => onConvene(t)}>{t}</button>)}
    </div>
  );
}

interface Props {
  state: CommitteeState;
  onFile: string[];
  onConvene: (ticker: string) => void;
}

/** Tells the visitor exactly what they are looking at when it isn't a fresh, complete live run, and what to try next. */
export function RunNotices({ state, onFile, onConvene }: Props) {
  const out = [];
  const r = state.result;
  const alternatives = <OnFile tickers={onFile} current={state.ticker} onConvene={onConvene} />;

  if (state.status === "error") {
    const dataNote = state.snapshot ? " The market data and indicators below are live." : "";
    if (state.errorStatus === 503) {
      // The server's message is meant for whoever runs the demo (e.g. which variable to set), not for visitors.
      out.push(
        <div className="notice warn" key="halt" title={state.error ?? undefined}>
          <div>
            <b>The committee isn't taking new cases right now.</b> Its AI budget for this demo is used up or switched off, so no
            Nemotron models were called.{dataNote}
            {alternatives}
          </div>
        </div>,
      );
    } else if (state.errorStatus === 429) {
      out.push(<div className="notice warn" key="halt"><div><b>The committee is busy.</b> {state.error}{dataNote}{alternatives}</div></div>);
    } else if (!state.snapshot) {
      out.push(
        <div className="notice error" key="halt">
          <div>
            <b>No market data for {state.ticker}.</b> {/^unknown ticker/i.test(state.error ?? "") ? "" : `${state.error} `}Zenith covers US-listed stocks by their ticker symbol
            (for example MSFT, or BRK-B for Berkshire Hathaway class B).
            {alternatives}
          </div>
        </div>,
      );
    } else {
      out.push(<div className="notice error" key="halt"><div><b>The committee couldn't finish.</b> {state.error}{dataNote}</div></div>);
    }
  }

  if (r?.replayed) {
    const at = when(r.generatedAt);
    const text =
      r.replayReason === "recent" ? (
        <><b>Decided recently, so it wasn't re-run.</b> The committee met on {r.ticker} at {at}. Serving it again cost nothing; the cost shown is what it cost at the time.</>
      ) : r.replayReason === "busy" ? (
        <><b>The committee is at its limit right now</b>, so this is its last saved decision on {r.ticker}, from {at}.</>
      ) : (
        <><b>Live analysis wasn't available</b>, so this is the committee's last saved decision on {r.ticker}, from {at}.</>
      );
    out.push(<div className={`notice ${r.replayReason === "recent" ? "ok" : "warn"}`} key="replay"><div>{text}</div></div>);
  }

  if (r?.chairError) {
    out.push(<div className="notice error" key="chair"><div><b>The chair couldn't reach a valid decision.</b> {r.chairError}</div></div>);
  }

  if (state.sources.some((s) => s.stale)) {
    out.push(<div className="notice warn" key="stale"><div><b>Some market data is from an older cache</b> because a live fetch failed.</div></div>);
  }

  return out.length ? <div className="notices">{out}</div> : null;
}
