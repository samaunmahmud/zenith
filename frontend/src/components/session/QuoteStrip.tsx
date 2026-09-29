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

/** The session's header: the company and its last close, then the session's state and what you can do with it. */
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
  const ticker = s?.ticker ?? state.ticker;
  return (
    <div className="qstrip">
      <div className="container qstrip-row">
        <div className="q-id">
          <span className="q-logo" aria-hidden="true">{ticker.slice(0, 4)}</span>
          <div className="q-names">
            <h1 className="q-name">{s?.companyName ?? (state.status === "error" ? ticker : "Loading…")}</h1>
            <p className="q-meta"><b className="q-sym">{ticker}</b>{s?.sector && <> · {s.sector}</>}{s && <> · close {s.asOf}</>}</p>
          </div>
        </div>
        {s && t && (
          <dl className="q-figs">
            <div className="q-px"><dt>Last close</dt><dd className="num">{s.facts.technicals["Last close"] ?? "n/a"}</dd></div>
            <div><dt>1 year</dt><dd className={`num ${toneOf(t.return1y) ?? ""}`}>{pct(t.return1y, true)}</dd></div>
            <div className="hide-md"><dt>1 month</dt><dd className={`num ${toneOf(t.return1m) ?? ""}`}>{pct(t.return1m, true)}</dd></div>
            <div className="hide-md"><dt>RSI 14</dt><dd className="num">{t.rsi14?.toFixed(1) ?? "n/a"}</dd></div>
            <div className="hide-md"><dt>Market cap</dt><dd className="num">{compactMoney(s.marketCap)}</dd></div>
          </dl>
        )}
        <div className="q-session">
          <span className={`q-mode ${play.mode === "live" ? "is-live" : "is-replay"} ${running ? "is-running" : ""}`}
            title={play.mode === "replay" && state.result ? `A saved session from ${when(state.result.generatedAt)}, played back from its recorded timings` : "Timed live as the committee works"}>
            <i aria-hidden="true" />
            {play.mode === "live" ? "Live" : `Replay ×${play.speed.toFixed(1)}`}
            <span className="q-clock num" aria-hidden="true">{clock(play.t)}</span>
          </span>
          {play.mode === "replay" && !play.finished && <button className="tbtn" onClick={play.skip}>Skip to ruling</button>}
          {decision && <span className={`q-call call-${decision.recommendation}`}>{decision.recommendation} <span className="num">{Math.round(decision.confidence * 100)}%</span></span>}
          <button className="tbtn icon-only" onClick={copyLink} aria-live="polite" title="Copy a link to this session" aria-label="Share"><LinkIcon />{copied && <span>Copied</span>}</button>
          <button className="tbtn icon-only" disabled={!state.result || !play.finished} onClick={() => state.result && downloadMemo(state.result)} title="Download the investment memo (Markdown)" aria-label="Download memo">
            <DownloadIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
