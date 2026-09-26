import type { AnalystReport, ChairDecision } from "../../types";
import { ANALYST_TITLE } from "../../lib/format";
import { ConfidenceBar, TierBadge } from "../ui/Badges";

const SIGN = { bullish: 1, neutral: 0, bearish: -1, BUY: 1, HOLD: 0, SELL: -1 } as const;

/** −1 (strongly bearish) … +1 (strongly bullish), mapped to 0–100% along the track. */
const position = (sign: number, confidence: number) => 50 + sign * confidence * 50;
const MIN_GAP = 16; // % of the track: closer than this and two labels would overlap
const ROW_H = 26;
const LABEL_H = 18;

/**
 * Row for each marker (x in %, any order): the first row whose last marker is at least MIN_GAP away.
 * Three identical positions (three neutral analysts) get three rows instead of drawing on top of each other.
 */
/** The chair tags points with their source ("[Fundamentals + Risk] ..."): show the tag as a label, not bracketed text. */
export function splitSource(text: string): { source: string | null; body: string } {
  const m = /^\[([^\]]{1,40})\]\s*(.*)$/s.exec(text);
  return m ? { source: m[1], body: m[2] } : { source: null, body: text };
}

function Attributed({ text }: { text: string }) {
  const { source, body } = splitSource(text);
  const first = source?.match(/fundamentals|technicals|risk/i)?.[0].toLowerCase();
  return source ? <><span className={`src-tag ${first ? `id-${first}` : ""}`}>{source}</span>{body}</> : <>{text}</>;
}

export function pinRows(xs: number[]): number[] {
  const order = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  const lastOnRow: number[] = [];
  const rows = new Array<number>(xs.length);
  for (const { x, i } of order) {
    let row = lastOnRow.findIndex((last) => x - last >= MIN_GAP);
    if (row === -1) row = lastOnRow.length;
    lastOnRow[row] = x;
    rows[i] = row;
  }
  return rows;
}

/** Near either end, hang the label inwards so it never runs off a narrow screen; the stem still marks the exact point. */
const edge = (x: number) => (x > 78 ? "edge-right" : x < 22 ? "edge-left" : "");

/**
 * Where each analyst landed (stance × confidence) and where the chair came down.
 * A picture of the vote: agreement clusters, dissent stands apart.
 */
function Consensus({ reports, decision }: { reports: AnalystReport[]; decision: ChairDecision }) {
  const counts = { bullish: 0, neutral: 0, bearish: 0 };
  reports.forEach((r) => counts[r.stance]++);
  const xs = reports.map((r) => position(SIGN[r.stance], r.confidence));
  const rows = pinRows(xs);
  const placed = reports.map((r, i) => ({ r, x: xs[i], row: rows[i] }));
  const rowCount = Math.max(1, ...rows.map((r) => r + 1));
  const trackTop = Math.max(54, (rowCount - 1) * ROW_H + LABEL_H + 10);
  const chairX = position(SIGN[decision.recommendation], decision.confidence);

  return (
    <div className="consensus" role="img" aria-label={`Analysts: ${counts.bullish} bullish, ${counts.neutral} neutral, ${counts.bearish} bearish. Chair: ${decision.recommendation}.`}>
      <div className="row spread">
        <span className="label">The vote</span>
        <span className="small num">
          <span className="stance-bullish">{counts.bullish} bullish</span>
          <span className="faint"> · </span>
          <span className="stance-neutral">{counts.neutral} neutral</span>
          <span className="faint"> · </span>
          <span className="stance-bearish">{counts.bearish} bearish</span>
        </span>
      </div>
      <div className="track-wrap" style={{ height: trackTop + 46 }}>
        {placed.map(({ r, x, row }) => (
          <div
            key={r.analyst}
            className={`pin stance-${r.stance} ${edge(x)} ${decision.dissent?.analyst === r.analyst ? "dissenter" : ""}`}
            style={{ left: `${x}%`, top: row * ROW_H, ["--stem" as string]: `${trackTop - row * ROW_H - LABEL_H}px` }}
            title={`${ANALYST_TITLE[r.analyst]}: ${r.stance}, ${Math.round(r.confidence * 100)}% confidence`}
          >
            <span>{ANALYST_TITLE[r.analyst]}</span>
            <i />
          </div>
        ))}
        <div className="track" style={{ top: trackTop }} />
        <div className={`chair-pin call-${decision.recommendation} ${edge(chairX)}`} style={{ left: `${chairX}%`, top: trackTop - 5 }}>
          <i />
          <span>Chair · {decision.recommendation}</span>
        </div>
      </div>
      <div className="track-scale">
        <span>Bearish</span>
        <span>Neutral</span>
        <span>Bullish</span>
      </div>
    </div>
  );
}

export function Verdict({ decision, reports }: { decision: ChairDecision; reports: AnalystReport[] }) {
  const d = decision;
  return (
    <section className="card verdict" aria-label="The chair's decision">
      <div className="row spread" style={{ marginBottom: 16 }}>
        <span className="label">The chair's decision</span>
        <TierBadge tier="ultra" />
      </div>
      <div className="verdict-top">
        <div className={`call call-${d.recommendation}`}>{d.recommendation}</div>
        <div>
          <div className="row spread small num" style={{ marginBottom: 8 }}>
            <span className="dim">Confidence <b style={{ color: "var(--text)" }}>{Math.round(d.confidence * 100)}%</b></span>
            <span className="dim">Horizon <b style={{ color: "var(--text)" }}>{d.timeHorizon}</b></span>
          </div>
          <ConfidenceBar value={d.confidence} className={`call-${d.recommendation}`} />
          <p className="verdict-summary">{d.summary}</p>
        </div>
      </div>

      {reports.length > 0 && <Consensus reports={reports} decision={d} />}

      <div className="verdict-grid">
        <div>
          <div className="label">Rationale</div>
          <ul>{d.rationale.map((r, i) => <li key={i}><Attributed text={r} /></li>)}</ul>
        </div>
        <div>
          <div className="label">Key risks</div>
          <ul>{d.keyRisks.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      </div>

      {d.dissent ? (
        <div className="dissent">
          <div className="label">Dissent on the record · {ANALYST_TITLE[d.dissent.analyst]} analyst</div>
          <p>{d.dissent.argument}</p>
        </div>
      ) : (
        <p className="small dim" style={{ marginTop: 18 }}>No dissent recorded: the committee was unanimous.</p>
      )}
    </section>
  );
}

/** Shown in the verdict's place while the committee is still working. */
export function VerdictPlaceholder({ stage }: { stage: string | null }) {
  return (
    <section className="card placeholder-verdict" aria-busy="true">
      <div className="row spread">
        <span className="label">The chair's decision</span>
        <TierBadge tier="ultra" />
      </div>
      <p className="muted">{stage === "chair" ? "The chair is weighing the arguments…" : "The chair decides once the analysts have reported."}</p>
      <div className="skeleton" style={{ width: "30%", height: 34 }} />
      <div className="skeleton" style={{ width: "92%" }} />
      <div className="skeleton" style={{ width: "76%" }} />
    </section>
  );
}
