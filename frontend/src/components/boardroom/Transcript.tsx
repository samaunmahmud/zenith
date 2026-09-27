import type { AgentModel, CostSummary, Tier } from "../../types";
import { integrityAgent, segmentFigures, type Entry, type Seat } from "../../lib/minutes";
import { ANALYST_TITLE, secs } from "../../lib/format";
import { splitSource } from "../committee/Verdict";
import { TierBadge } from "../ui/Badges";

const SPEAKER: Record<Seat, string> = {
  clerk: "The Clerk",
  news: "News desk",
  fundamentals: "Fundamentals",
  technicals: "Technicals",
  risk: "Risk",
  chair: "The Chair",
};

interface Ctx {
  /** Figures the integrity check couldn't trace, per agent id ("risk", "risk-rebuttal", "chair"). */
  flags: Record<string, string[]>;
  /** The check has run (the session finished), so unflagged figures can be shown as traced. */
  checked: boolean;
}

/** Text with each figure marked: traced to the agent's fact sheet, or flagged as not found there. */
function Figures({ text, agent, ctx }: { text: string; agent: string | null; ctx: Ctx }) {
  const segs = segmentFigures(text, agent ? ctx.flags[agent] ?? [] : [], ctx.checked);
  return (
    <>
      {segs.map((s, i) =>
        s.figure === "flagged" ? (
          <mark key={i} className="fig fig-flagged" title="Not found in this agent's input: flagged by the hallucination guard">{s.text}</mark>
        ) : s.figure === "traced" ? (
          <mark key={i} className="fig fig-traced" title="Traced to the figures computed in Java">{s.text}</mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

/** Model time and tokens an agent's calls took (retries included), from the cost log. */
function took(costs: CostSummary | null, id: string): string | null {
  const calls = costs?.calls.filter((c) => c.agent === id) ?? [];
  if (!calls.length) return null;
  const ms = calls.reduce((a, c) => a + c.latencyMs, 0);
  const tok = calls.reduce((a, c) => a + c.promptTokens + c.completionTokens, 0);
  return `${secs(ms)} · ${tok.toLocaleString()} tok`;
}

function Body({ e, ctx }: { e: Entry; ctx: Ctx }) {
  const agent = integrityAgent(e);
  const f = (t: string) => <Figures text={t} agent={agent} ctx={ctx} />;
  switch (e.kind) {
    case "clerk": {
      const total = e.figures.fundamentals + e.figures.technicals + e.figures.risk;
      return (
        <>
          <p className="said">Before any model speaks, I've calculated <b>{total} figures</b> from market data: returns, moving averages, RSI, MACD, volatility, drawdown, beta and valuation ratios.</p>
          <p className="aside">Each analyst gets only its own fact sheet ({e.figures.fundamentals} fundamentals · {e.figures.technicals} technicals · {e.figures.risk} risk) and may quote nothing else. <a href="#proof">See the sheets</a></p>
        </>
      );
    }
    case "news":
      return e.digest ? (
        <>
          <p className="said">Headline sentiment is <b className={`sent-${e.digest.sentiment}`}>{e.digest.sentiment}</b>. {e.digest.themes.join(". ")}.</p>
          {e.digest.notableEvents.length > 0 && <ul className="points">{e.digest.notableEvents.map((n, i) => <li key={i}>{n}</li>)}</ul>}
        </>
      ) : (
        <p className="said">No recent headlines for this company.</p>
      );
    case "report": {
      const r = e.report;
      return (
        <>
          <div className="stance-line">
            <span className={`badge ${r.stance}`}>{r.stance}</span>
            <span className="xs dim num">{Math.round(r.confidence * 100)}% confidence</span>
          </div>
          <p className="said">{f(r.headline)}</p>
          <ul className="points">{r.keyPoints.map((k, i) => <li key={i}>{f(k)}</li>)}</ul>
          {r.evidence.length > 0 && (
            <div className="evidence-chips">
              {r.evidence.map((ev, i) => (
                <span key={i} className="echip" title={ev.interpretation}>
                  <span>{ev.metric}</span>
                  <b className="num">{ev.value}</b>
                  <i aria-label="checked against the fact sheet">✓</i>
                </span>
              ))}
            </div>
          )}
          {r.concerns.length > 0 && (
            <details className="concerns-d">
              <summary>What would make me wrong ({r.concerns.length})</summary>
              <ul className="points">{r.concerns.map((c, i) => <li key={i}>{f(c)}</li>)}</ul>
            </details>
          )}
        </>
      );
    }
    case "analystError":
      return <p className="said neg">Couldn't produce a valid report after a retry. {e.message}</p>;
    case "rebuttal":
      return (
        <>
          <p className="aside">Replying to <b className={`member id-${e.rebuttal.respondingTo}`}><i className="id-mark" aria-hidden="true" />{ANALYST_TITLE[e.rebuttal.respondingTo]}</b>
            {e.rebuttal.stanceChanged && <span className="changed">changed stance</span>}</p>
          <p className="said">{f(e.rebuttal.response)}</p>
        </>
      );
    case "ruling": {
      const d = e.decision;
      return (
        <>
          <p className="said ruling">The committee rules <b className={`call-${d.recommendation}`}>{d.recommendation}</b> at {Math.round(d.confidence * 100)}% confidence. {f(d.summary)}</p>
          <ul className="points">
            {d.rationale.map((r, i) => {
              const { source, body } = splitSource(r);
              const first = source?.match(/fundamentals|technicals|risk/i)?.[0].toLowerCase();
              return <li key={i}>{source && <span className={`src-tag ${first ? `id-${first}` : ""}`}>{source}</span>}{f(body)}</li>;
            })}
          </ul>
          {d.dissent && (
            <div className="dissent-note">
              <span className="label">Dissent on the record · {ANALYST_TITLE[d.dissent.analyst]}</span>
              <p>{f(d.dissent.argument)}</p>
            </div>
          )}
        </>
      );
    }
    case "chairError":
      return <p className="said neg">{e.message}</p>;
  }
}

interface Props {
  entries: Entry[];
  agents: AgentModel[];
  costs: CostSummary | null;
  flags: Record<string, string[]>;
  checked: boolean;
  /** The seat whose statement is read next, shown as "typing". */
  next: Seat | null;
}

/** The minutes of the meeting: each statement as it is read into the record. */
export function Transcript({ entries, agents, costs, flags, checked, next }: Props) {
  const tierOf = (seat: Seat): Tier | null => agents.find((a) => a.id === seat)?.tier ?? null;
  const ctx = { flags, checked };
  return (
    <ol className="minutes-feed" aria-live="polite">
      {entries.map((e) => {
        const tier = tierOf(e.seat);
        const time = e.kind === "clerk" ? null : took(costs, e.kind === "rebuttal" ? `${e.seat}-rebuttal` : e.seat);
        return (
          <li key={e.id} className={`minute minute-${e.kind} id-${e.seat}`}>
            <div className="minute-who">
              <i className="id-mark" aria-hidden="true" />
              <b>{SPEAKER[e.seat]}</b>
              {e.kind === "rebuttal" && <span className="xs dim">rebuttal</span>}
              {tier ? <TierBadge tier={tier} /> : e.seat === "clerk" ? <span className="badge code">Java · $0</span> : null}
              {time && <span className="minute-time num">{time}</span>}
            </div>
            <div className="minute-body"><Body e={e} ctx={ctx} /></div>
          </li>
        );
      })}
      {next && (
        <li className={`minute minute-typing id-${next}`} aria-hidden="true">
          <div className="minute-who"><i className="id-mark" /><b>{SPEAKER[next]}</b></div>
          <div className="minute-body"><i className="typing"><i /><i /><i /></i></div>
        </li>
      )}
    </ol>
  );
}
