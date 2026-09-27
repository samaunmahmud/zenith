import { modelName } from "../boardroom/BoardTable";
import { usd } from "../../lib/format";
import { progressAt, statusAt, totalsAt, type Proc, type ProcStatus } from "../../lib/tape";
import type { Playback } from "../../hooks/usePlayback";
import { Panel, TierTag } from "./Panel";

const GLYPH: Record<ProcStatus, string> = { queued: "·", running: "", done: "✓", failed: "✗" };
const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function Row({ p, t, live }: { p: Proc; t: number; live: boolean }) {
  const st = statusAt(p, t);
  const k = progressAt(p, t);
  const elapsed = p.start === null || st === "queued" ? null : Math.max(0, (st === "running" ? t : p.end!) - p.start);
  // On a replay the recorded totals count up while the call "runs"; live counts arrive when the run ends.
  const shown = (x: number | null) => (x === null ? null : st === "done" || st === "failed" ? x : !live && st === "running" ? Math.round(x * k) : null);
  const out = shown(p.tokensOut);
  const cost = p.cost === null ? null : st === "done" || st === "failed" ? p.cost : null;
  return (
    <tr className={`prow prow-${st} id-${p.seat}`}>
      <td className="p-st" aria-label={st}>{st === "running" ? <span className="spin">{SPIN[Math.floor(t / 80) % SPIN.length]}</span> : GLYPH[st]}</td>
      <td className="p-who"><i className="id-mark" aria-hidden="true" />{p.label}<span className="p-task">{p.task}</span></td>
      <td className="p-model"><TierTag tier={p.tier} /><span className="hide-sm">{p.tier ? modelName(p.model)?.replace(/^Nemotron /, "") : "no model"}</span></td>
      <td className="p-bar" aria-hidden="true">
        <span className="pbar"><i style={{ width: `${(st === "running" && live ? 0.5 : k) * 100}%` }} className={st === "running" && live ? "is-indeterminate" : ""} /></span>
      </td>
      <td className="num p-time">{elapsed === null ? "—" : `${(elapsed / 1000).toFixed(1)}s`}</td>
      <td className="num p-tok">{p.tier === null ? "—" : out === null ? "…" : out.toLocaleString("en-GB")}</td>
      <td className="num p-cost">{p.tier === null ? "$0" : cost === null ? "…" : usd(cost)}</td>
    </tr>
  );
}

/**
 * Every process the committee ran, like a system monitor: who, on which model, how long, how many tokens, what it
 * cost. The analysts share a start time because they run in parallel; the round waits for the slowest.
 */
export function ProcessMonitor({ play }: { play: Playback }) {
  const { tape, t, mode } = play;
  const live = mode === "live";
  const tot = totalsAt(tape, t);
  const running = tape.procs.filter((p) => statusAt(p, t) === "running").length;
  return (
    <Panel code="PRC" title="Process monitor" id="prc"
      meta={<span className="num">{running > 0 ? <><b className="pos">{running}</b> running · </> : null}{tot.calls} model calls · {tot.tokens.toLocaleString("en-GB")} tok</span>}>
      <div className="table-scroll">
        <table className="ptable">
          <thead>
            <tr><th aria-label="Status" /><th>Process</th><th>Model</th><th aria-label="Progress" /><th className="num">Time</th><th className="num">Out tok</th><th className="num">Cost</th></tr>
          </thead>
          <tbody>
            {tape.procs.map((p) => <Row key={p.id} p={p} t={t} live={live} />)}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
