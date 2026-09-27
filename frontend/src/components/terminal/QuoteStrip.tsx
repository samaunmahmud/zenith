import { useState } from "react";
import type { CommitteeState } from "../../state/committee";
import type { ChairDecision } from "../../types";
import { compactMoney, pct, toneOf, when } from "../../lib/format";
import { downloadMemo } from "../committee/MemoPanel";
import { DownloadIcon, LinkIcon } from "../ui/Icons";
import type { Playback } from "../../hooks/usePlayback";
import { clock } from "./Panel";

interface Props {
  state: CommitteeState;
  play: Playback;
  /** The ruling once it has been read out on the tape (never before). */
  decision: ChairDecision | null;
}

/** The security line: identity and last close on the left, the session clock and the call on the right. */
export function QuoteStrip({ state, play, decision }: Props) {
  const [copied, setCopied] = useState(false);
  const s = state.snapshot;
  const t = s?.technicals;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this link", window.location.href);
    }
  };

  const running = !play.finished && state.status !== "error";
  return (
    <div className="qstrip">
      <div className="container qstrip-row">
        <div className="q-id">
          <h1 className="q-sym">{s?.ticker ?? state.ticker}</h1>
          <span className="q-name">{s?.companyName ?? "Loading…"}</span>
          {s?.sector && <span className="q-meta">{s.sector}</span>}
        </div>
        {s && t && (
          <dl className="q-figs num">
            <div><dt>Last</dt><dd className="q-px">{s.facts.technicals["Last close"] ?? "n/a"}</dd></div>
            <div><dt>1Y</dt><dd className={toneOf(t.return1y)}>{pct(t.return1y, true)}</dd></div>
            <div className="hide-md"><dt>1M</dt><dd className={toneOf(t.return1m)}>{pct(t.return1m, true)}</dd></div>
            <div className="hide-md"><dt>RSI</dt><dd>{t.rsi14?.toFixed(1) ?? "n/a"}</dd></div>
            <div className="hide-md"><dt>Mkt cap</dt><dd>{compactMoney(s.marketCap)}</dd></div>
            <div className="hide-sm"><dt>Close</dt><dd>{s.asOf}</dd></div>
          </dl>
        )}
        <div className="q-session">
          <span className={`q-mode ${play.mode === "live" ? "is-live" : "is-replay"} ${running ? "is-running" : ""}`}
            title={play.mode === "replay" && state.result ? `A saved session from ${when(state.result.generatedAt)}, played back from its recorded timings` : "Timed live as the committee works"}>
            <i aria-hidden="true" />
            {play.mode === "live" ? "LIVE" : `REPLAY ×${play.speed.toFixed(1)}`}
          </span>
          <span className="q-clock num" aria-hidden="true">{clock(play.t)}</span>
          {play.mode === "replay" && !play.finished && <button className="tbtn" onClick={play.skip}>Skip ▸▸</button>}
          {decision && (
            <span className={`q-call call-${decision.recommendation}`}>
              {decision.recommendation} <span className="num">{Math.round(decision.confidence * 100)}%</span>
            </span>
          )}
          <button className="tbtn" onClick={copyLink} aria-live="polite" title="Copy a link to this session"><LinkIcon /> {copied ? "Copied" : "Share"}</button>
          <button className="tbtn" disabled={!state.result || !play.finished} onClick={() => state.result && downloadMemo(state.result)} title="Download the investment memo (Markdown)">
            <DownloadIcon /> Memo
          </button>
        </div>
      </div>
    </div>
  );
}
