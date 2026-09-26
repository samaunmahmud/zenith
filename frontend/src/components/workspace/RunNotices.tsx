import type { CommitteeState } from "../../state/committee";
import { when } from "../../lib/format";

/** Tells the visitor exactly what they are looking at when it isn't a fresh, complete live run. */
export function RunNotices({ state }: { state: CommitteeState }) {
  const out = [];
  const r = state.result;

  if (state.status === "error") {
    const dataNote = state.snapshot ? " The market data and indicators below were still computed live." : "";
    if (state.errorStatus === 503) {
      out.push(
        <div className="notice warn" key="halt">
          <div>
            <b>The AI committee is switched off right now.</b> Its model budget is used up or not configured, so no Nemotron calls
            were made.{dataNote}
            <div className="xs dim" style={{ marginTop: 2 }}>{state.error}</div>
          </div>
        </div>,
      );
    } else if (state.errorStatus === 429) {
      out.push(<div className="notice warn" key="halt"><div><b>The committee is busy.</b> {state.error}{dataNote}</div></div>);
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
