import { modelName, usd } from "../../lib/format";
import { progressAt, statusAt, totalsAt, type Proc } from "../../lib/tape";
import type { Playback } from "../../hooks/usePlayback";
import { Panel, TierTag } from "./Panel";

/** The axis length: the session so far, rounded up to the next 10s (never under 10s), so the axis reads as a round number. */
function scaleMax(ms: number): number {
  return Math.ceil(Math.max(10_000, ms) / 10_000) * 10_000;
}

function Row({ p, t, max, live }: { p: Proc; t: number; max: number; live: boolean }) {
  const st = statusAt(p, t);
  const k = progressAt(p, t);
  const start = p.start ?? 0;
  // A live call's end isn't known until it finishes, so its bar grows with the clock; a replay's grows to its recorded end.
  const end = st === "queued" ? start : st === "running" ? (live || p.end === null ? t : start + (p.end - start) * k) : p.end ?? t;
  const elapsed = st === "queued" || p.start === null ? null : Math.max(0, end - start);
  const shownOut = p.tokensOut === null ? null : st === "done" || st === "failed" ? p.tokensOut : !live && st === "running" ? Math.round(p.tokensOut * k) : null;
  return (
    <li className={`tl-row is-${st} id-${p.seat}`}>
      <div className="tl-who">
        <i className="id-mark" aria-hidden="true" />
        <span className="tl-name">{p.label}</span>
        <span className="tl-task">{p.task}</span>
      </div>
      <div className="tl-model"><TierTag tier={p.tier} /><span className="tl-mname">{p.tier ? modelName(p.model)?.replace(/^Nemotron /, "") : "no model"}</span></div>
      <div className="tl-track" aria-hidden="true">
        {st !== "queued" && (
          <span className={`tl-bar tier-${p.tier ?? "java"}`} style={{ left: `${(start / max) * 100}%`, width: `${Math.max(0.6, ((end - start) / max) * 100)}%` }} />
        )}
      </div>
      <div className="tl-stats num">
        <span className="tl-time">{elapsed === null ? "—" : `${(elapsed / 1000).toFixed(1)}s`}</span>
        <span className="tl-tok hide-sm">{p.tier === null ? "" : shownOut === null ? (st === "queued" ? "" : "…") : `${shownOut.toLocaleString("en-GB")} tok`}</span>
        <span className="tl-cost">{p.tier === null ? "$0" : st === "done" || st === "failed" ? (p.cost === null ? "…" : usd(p.cost)) : ""}</span>
      </div>
    </li>
  );
}

/**
 * Every call the committee made, on one time axis: who ran, on which Nemotron model, when, for how long, and what it
 * cost. The analysts' bars start together because they run in parallel; the next round waits for the slowest.
 */
export function Timeline({ play, id = "timeline" }: { play: Playback; id?: string }) {
  const { tape, t, mode } = play;
  const live = mode === "live";
  const tot = totalsAt(tape, t);
  const running = tape.procs.filter((p) => statusAt(p, t) === "running").length;
  const max = scaleMax(Math.max(t, tape.total ?? 0));
  return (
    <Panel title="Pipeline" id={id} className="timeline"
      meta={<span className="num">{running > 0 ? <><b className="pos">{running} running</b> · </> : null}{tot.calls} calls · {tot.tokens.toLocaleString("en-GB")} tokens · axis 0–{max / 1000}s</span>}>
      <ol className="tl-rows">
        {tape.procs.map((p) => <Row key={p.id} p={p} t={t} max={max} live={live} />)}
      </ol>
    </Panel>
  );
}
