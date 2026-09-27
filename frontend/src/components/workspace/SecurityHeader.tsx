import { useState, type ReactNode } from "react";
import type { CommitteeState } from "../../state/committee";
import type { ChairDecision, Stage } from "../../types";
import { pct, toneOf } from "../../lib/format";
import { VerdictChip } from "../ui/Badges";
import { DownloadIcon, LinkIcon } from "../ui/Icons";
import { downloadMemo } from "../committee/MemoPanel";

const STAGE_LABEL: Record<Stage, string> = {
  data: "Market data",
  news: "News desk",
  analysts: "Analysts",
  rebuttals: "Rebuttals",
  chair: "Chair",
  memo: "Memo",
};

function SessionStatus({ state, decision }: { state: CommitteeState; decision: ChairDecision | null }) {
  if (state.status === "running") {
    return (
      <span className="session-chip" aria-live="polite">
        <i className="spinner" aria-hidden="true" /> In session{state.stage ? ` · ${STAGE_LABEL[state.stage]}` : ""}
      </span>
    );
  }
  if (decision) return <VerdictChip decision={decision} />;
  if (state.decision) return <span className="session-chip">In session</span>; // the ruling hasn't been read out yet
  if (state.status === "error") return <span className="session-chip">Adjourned</span>;
  if (state.result?.chairError) return <span className="session-chip">No decision</span>;
  return null;
}

/** Sticky header for the security under review: identity, price, the committee's call, actions, and the tabs. */
/** `decision` is the ruling as far as the visitor has seen it, so the header never gives it away before the table does. */
export function SecurityHeader({ state, tabs, decision = state.decision }: { state: CommitteeState; tabs: ReactNode; decision?: ChairDecision | null }) {
  const [copied, setCopied] = useState(false);
  const s = state.snapshot;
  const r1y = s?.technicals.return1y ?? null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this link", window.location.href);
    }
  };

  return (
    <div className="sec-header">
      <div className="container">
        <div className="sec-row">
          <div className="sec-id">
            <h1 className="sym">{s?.ticker ?? state.ticker}</h1>
            {s && <span className="name">{s.companyName}</span>}
            {s && (s.sector || s.industry) && <span className="meta">{[s.sector, s.industry].filter(Boolean).join(" · ")}</span>}
          </div>
          {s && (
            <div className="sec-price num">
              <span className="px">{s.facts.technicals["Last close"] ?? "n/a"}</span>
              <span className={`small ${toneOf(r1y) ?? "dim"}`} style={{ fontWeight: 600 }}>{pct(r1y, true)} 1Y</span>
              <span className="asof">Close {s.asOf}</span>
            </div>
          )}
          <div className="sec-actions">
            <SessionStatus state={state} decision={decision} />
            <button className="btn btn-sm" onClick={copyLink} aria-live="polite">
              <LinkIcon /> {copied ? "Link copied" : "Share"}
            </button>
            <button className="btn btn-sm" disabled={!state.result} onClick={() => state.result && downloadMemo(state.result)}>
              <DownloadIcon /> Memo
            </button>
          </div>
        </div>
        {tabs}
      </div>
    </div>
  );
}
