import { useEffect, useRef, type ReactNode } from "react";
import type { CommitteeState } from "../../state/committee";
import type { AnalystName } from "../../types";
import { ANALYST_TITLE } from "../../lib/format";
import { statusAt, type Proc } from "../../lib/tape";
import type { Playback } from "../../hooks/usePlayback";
import { Panel, TierTag, clock } from "./Panel";
import { Typed } from "./Typed";

interface Line {
  key: string;
  at: number;
  proc: Proc;
  kind: "start" | "out" | "fail";
  /** What the agent said: typed in when it's the newest line. */
  text?: string;
  tag?: ReactNode;
  points?: string[];
}

function linesFor(state: CommitteeState, play: Playback): Line[] {
  const { tape, t } = play;
  const out: Line[] = [];
  const clerkFigures = state.snapshot ? Object.values(state.snapshot.facts).reduce((n, f) => n + Object.keys(f ?? {}).length, 0) : 0;
  for (const p of tape.procs) {
    const st = statusAt(p, t);
    if (st === "queued" || p.start === null) continue;
    out.push({ key: `${p.id}-start`, at: p.start, proc: p, kind: "start" });
    if (st === "running" || p.end === null) continue;
    const base = { key: `${p.id}-out`, at: p.end, proc: p };
    if (st === "failed") {
      out.push({ ...base, kind: "fail", text: "No valid answer after retry; the committee continues without it." });
      continue;
    }
    if (p.phase === "clerk") {
      out.push({ ...base, kind: "out", text: `${clerkFigures} figures computed from market data dated ${state.snapshot?.asOf ?? "n/a"}. Each analyst receives only its own fact sheet.` });
    } else if (p.phase === "news") {
      const d = state.digest;
      out.push({ ...base, kind: "out", tag: d ? <span className={`tone-${d.sentiment}`}>{d.sentiment.toUpperCase()}</span> : undefined,
        text: d ? d.themes.join(" · ") : "No headlines to digest.", points: d?.notableEvents.slice(0, 3) });
    } else if (p.phase === "analysts") {
      const r = state.reports[p.seat as AnalystName];
      if (!r) continue;
      out.push({ ...base, kind: "out", tag: <span className={`stance-${r.stance}`}>{r.stance.toUpperCase()} {Math.round(r.confidence * 100)}%</span>, text: r.headline, points: r.keyPoints.slice(0, 3) });
    } else if (p.phase === "rebuttals") {
      const rb = state.debate.find((x) => `${x.analyst}-rebuttal` === p.id);
      if (!rb) continue;
      out.push({ ...base, kind: "out",
        tag: <>→ {ANALYST_TITLE[rb.respondingTo]}{rb.stanceChanged && <span className="t-changed">STANCE CHANGED</span>}</>, text: rb.response });
    } else if (p.phase === "chair") {
      const d = state.decision;
      if (!d) continue;
      out.push({ ...base, kind: "out", tag: <span className={`call-${d.recommendation}`}>RULING {d.recommendation} {Math.round(d.confidence * 100)}%</span>, text: d.summary });
    }
  }
  return out.sort((a, b) => a.at - b.at || (a.kind === "start" ? -1 : 1));
}

/** The session as a log: each process starting, then what it said, stamped on the session clock. */
export function EventLog({ state, play }: { state: CommitteeState; play: Playback }) {
  const lines = linesFor(state, play);
  const flags = Object.fromEntries((state.result?.integrity ?? []).map((f) => [f.agent, f.figures]));
  const checked = Boolean(state.result) && play.finished;
  const box = useRef<HTMLDivElement>(null);
  const lastOut = [...lines].reverse().find((l) => l.kind !== "start")?.key;

  useEffect(() => {
    if (!play.finished) box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" });
  }, [lines.length, play.finished]);

  return (
    <Panel code="LOG" title="Session log" id="log" className="tlog"
      meta={checked ? <span><mark className="fig fig-traced">1.23</mark> traced · <mark className="fig fig-flagged">4.5</mark> not in fact sheet</span> : "figures checked when the session closes"}>
      <div className="log-box" ref={box} aria-live="polite">
        {lines.length === 0 && <p className="log-line dim">{state.status === "error" ? state.error : "Connecting to the committee…"}</p>}
        {lines.map((l) => (
          <div key={l.key} className={`log-line log-${l.kind} id-${l.proc.seat}`}>
            <span className="log-t num">{clock(l.at)}</span>
            <span className="log-who"><i className="id-mark" aria-hidden="true" />{l.proc.label}</span>
            <span className="log-msg">
              {l.kind === "start" ? (
                <span className="dim">
                  <TierTag tier={l.proc.tier} /> {l.proc.phase === "clerk" ? "fetching prices, fundamentals and headlines; computing indicators" : `${l.proc.task}…`}
                </span>
              ) : (
                <>
                  {l.tag && <span className="log-tag">{l.tag}</span>}
                  {l.text && <span className={l.kind === "fail" ? "neg" : "log-text"}>
                    <Typed text={l.text} flagged={flags[l.proc.id] ?? []} checked={checked} animate={l.key === lastOut && !play.finished} />
                  </span>}
                  {l.points && l.points.length > 0 && (
                    <ul className="log-points">{l.points.map((x) => <li key={x}><Typed text={x} flagged={flags[l.proc.id] ?? []} checked={checked} animate={false} /></li>)}</ul>
                  )}
                </>
              )}
            </span>
          </div>
        ))}
        {!play.finished && state.status !== "error" && <div className="log-line log-cursor"><span className="caret" aria-hidden="true">▌</span></div>}
      </div>
    </Panel>
  );
}
