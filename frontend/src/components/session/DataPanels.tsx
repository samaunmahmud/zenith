import { useState } from "react";
import { verifyReceipt } from "../../api";
import type { CommitteeState } from "../../state/committee";
import type { AnalystName, Receipt, ReceiptCheck } from "../../types";
import { ANALYSTS, ANALYST_TITLE, ago, safeUrl, when } from "../../lib/format";
import type { Playback } from "../../hooks/usePlayback";
import { Term } from "../ui/Term";
import { Panel } from "./Panel";

/** Why the numbers can be trusted: where they came from, and what the guard checked. */
export function IntegrityPanel({ state, play }: { state: CommitteeState; play: Playback }) {
  const r = state.result;
  const s = state.snapshot;
  const figures = s ? ANALYSTS.reduce((n, a) => n + Object.keys(s.facts[a] ?? {}).length, 0) : 0;
  const ready = Boolean(r) && play.finished;
  const evidence = r ? r.reports.reduce((n, x) => n + x.evidence.length, 0) : 0;
  const flagged = r ? r.integrity.reduce((n, f) => n + f.figures.length, 0) : 0;
  const retries = r ? r.costs.calls.filter((c) => c.attempt > 1).length : 0;
  const Check = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
    <li className={ok ? "ok" : "warn"}><span className="chk" aria-hidden="true">{ok ? "✓" : "!"}</span><span>{children}</span></li>
  );
  return (
    <Panel title="Integrity checks" id="int" meta={ready ? (flagged ? <span className="warn">{flagged} flagged</span> : <span className="pos">all traced</span>) : "runs at close"}>
      <ul className="checks">
        <Check ok={figures > 0}><b className="num">{figures}</b> figures computed in Java, none by a model</Check>
        {ready ? (
          <>
            <Check ok><b className="num">{evidence}</b> evidence values cited, each matched to a fact sheet (a mismatch is rejected)</Check>
            <Check ok={retries === 0}><b className="num">{retries}</b> repl{retries === 1 ? "y" : "ies"} sent back for a schema or evidence retry</Check>
            <Check ok={flagged === 0}>
              <b className="num">{flagged}</b> figure{flagged === 1 ? "" : "s"} in the prose not found in the input
              {r!.integrity.length > 0 && <> ({r!.integrity.map((f) => <span key={f.agent}>{f.agent}: {f.figures.map((x) => <mark key={x} className="fig fig-flagged">{x}</mark>)} </span>)})</>}
            </Check>
          </>
        ) : (
          <li className="dim"><span className="chk" aria-hidden="true">·</span><span>Evidence and prose are checked when the session closes.</span></li>
        )}
      </ul>
      {ready && r!.receipt && <ReceiptRow ticker={r!.ticker} receipt={r!.receipt} />}
      {state.sources.length > 0 && (
        <div className="sources">
          <span className="lbl">Data sources</span>
          {state.sources.map((x) => (
            <span key={x.name} className={`src ${x.stale ? "is-stale" : ""}`} title={`Fetched ${when(x.fetchedAt)}${x.stale ? " (stale: served from cache)" : ""}`}>
              {x.name} <span className="dim num">{ago(x.fetchedAt)}</span>
            </span>
          ))}
        </div>
      )}
    </Panel>
  );
}

/**
 * The decision receipt: SHA-256 fingerprints of the fact sheets, prompts, models and ruling. "Verify" asks the server
 * to re-hash the saved decision, so a visitor can see the ruling on file is exactly the one the committee made.
 */
function ReceiptRow({ ticker, receipt }: { ticker: string; receipt: Receipt }) {
  const [check, setCheck] = useState<ReceiptCheck | null | "loading" | "none">(null);
  const verify = async () => {
    setCheck("loading");
    setCheck((await verifyReceipt(ticker)) ?? "none");
  };
  const result = typeof check === "object" && check !== null ? check : null;
  const sameRun = result?.receipt.id === receipt.id;
  return (
    <div className="receipt">
      <span className="lbl">Decision receipt</span>
      <code className="num" title={`Fact sheets ${receipt.factSheets}\nRuling ${receipt.ruling}`}>{receipt.id}</code>
      <span className="dim">{receipt.algorithm} of the fact sheets, prompts, models and ruling</span>
      {check === null && <button type="button" className="receipt-btn" onClick={verify}>Verify</button>}
      {check === "loading" && <span className="dim">Checking…</span>}
      {check === "none" && <span className="warn">No receipt on file to check against</span>}
      {result && !sameRun && <span className="dim">A newer ruling ({result.receipt.id}) is on file now</span>}
      {result && sameRun && (result.intact
        ? <span className="pos">✓ Intact: fact sheets and ruling re-hash to this receipt{result.check.changedPrompts.length > 0 && `; prompts changed since: ${result.check.changedPrompts.join(", ")}`}</span>
        : <span className="warn">! Doesn't match: the saved {result.check.factSheetsMatch ? "ruling" : "fact sheets"} changed after the meeting</span>)}
    </div>
  );
}

/** Every figure the analysts were given, exactly as they saw it. */
export function FactsPanel({ state }: { state: CommitteeState }) {
  const [tab, setTab] = useState<AnalystName>("fundamentals");
  const s = state.snapshot;
  const facts = s?.facts[tab] ?? {};
  return (
    <Panel title="Fact sheets" id="fct" meta={s ? `as of ${s.asOf}` : undefined}>
      <div className="tseg" role="tablist" aria-label="Fact sheet">
        {ANALYSTS.map((a) => (
          <button key={a} role="tab" aria-selected={tab === a} className={`id-${a}`} onClick={() => setTab(a)}>
            <i className="id-mark" aria-hidden="true" />{ANALYST_TITLE[a]} <span className="dim num">{Object.keys(s?.facts[a] ?? {}).length}</span>
          </button>
        ))}
      </div>
      <dl className="facts num">
        {Object.entries(facts).map(([k, v]) => (
          <div key={k}><dt><Term label={k} /></dt><dd className={/^[+]/.test(v) ? "pos" : /^[-−]/.test(v) ? "neg" : undefined}>{v}</dd></div>
        ))}
      </dl>
    </Panel>
  );
}

/** The headlines the news desk read. */
export function NewsPanel({ state }: { state: CommitteeState }) {
  return (
    <Panel title="Headlines" id="nws" meta={`${state.news.length} headlines`}>
      {state.news.length === 0 ? (
        <p className="dim small">No recent headlines.</p>
      ) : (
        <ul className="newswire">
          {state.news.map((n) => {
            const url = safeUrl(n.url);
            return (
              <li key={n.url + n.headline}>
                <span className="nw-t num">{ago(n.datetime)}</span>
                <span className="nw-src">{n.source}</span>
                {url ? <a href={url} target="_blank" rel="noreferrer">{n.headline}</a> : <span>{n.headline}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
