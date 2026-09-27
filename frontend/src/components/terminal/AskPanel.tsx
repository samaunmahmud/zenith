import { useEffect, useRef, useState, type FormEvent } from "react";
import { postAsk } from "../../api";
import type { CommitteeState } from "../../state/committee";
import type { AskResult, AskTurn } from "../../types";
import { ANALYST_TITLE, secs, usd } from "../../lib/format";
import { modelName } from "../boardroom/BoardTable";
import { Panel, TierTag } from "./Panel";
import { Typed } from "./Typed";

/** Earlier turns sent back with each question (the server keeps the same limit). */
const MAX_HISTORY = 4;
const MAX_CHARS = 400;

type Msg = { id: number; question: string } & ({ status: "pending"; since: number } | { status: "done"; result: AskResult } | { status: "error"; error: string });

/** Opening questions that fit this session: why the call, the dissent, what would change it, the risk. */
export function starters(s: CommitteeState): string[] {
  const d = s.decision;
  if (!d) return [];
  const out = [`Why ${d.recommendation} and not ${d.recommendation === "BUY" ? "HOLD" : d.recommendation === "SELL" ? "HOLD" : "BUY"}?`];
  if (d.dissent) out.push(`How strong is the ${ANALYST_TITLE[d.dissent.analyst]} dissent?`);
  out.push("What would change the committee's mind?", `What's the biggest risk in ${s.ticker}?`);
  return out.slice(0, 4);
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(performance.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(id);
  }, []);
  return <span className="num">{secs(now - since)}</span>;
}

/**
 * Ask the committee: follow-up questions about this session, answered by the committee secretary on Nemotron
 * Super from the session's own fact sheets, reports and ruling. Figures in the answer are checked like the
 * analysts' (green: in the session; red: not), and each answer shows what it cost.
 */
export function AskPanel({ state }: { state: CommitteeState }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const nextId = useRef(1);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const busy = msgs.some((m) => m.status === "pending");
  const secretary = state.agents.find((a) => a.tier === "super"); // the secretary runs on the same Super model
  const last = [...msgs].reverse().find((m) => m.status === "done");
  const suggestions = last?.status === "done" ? last.result.answer.followUps : starters(state);

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  const ask = async (raw: string) => {
    const question = raw.trim();
    if (!question || busy) return;
    const history: AskTurn[] = msgs
      .filter((m): m is Msg & { status: "done"; result: AskResult } => m.status === "done")
      .slice(-MAX_HISTORY)
      .map((m) => ({ question: m.question, answer: m.result.answer.answer }));
    const id = nextId.current++;
    setMsgs((xs) => [...xs, { id, question, status: "pending", since: performance.now() }]);
    setQ("");
    try {
      const result = await postAsk(state.ticker, question, history);
      setMsgs((xs) => xs.map((m) => (m.id === id ? { id, question, status: "done", result } : m)));
    } catch (e) {
      setMsgs((xs) => xs.map((m) => (m.id === id ? { id, question, status: "error", error: (e as Error).message } : m)));
    }
    input.current?.focus();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    ask(q);
  };

  const spent = msgs.reduce((n, m) => n + (m.status === "done" ? m.result.costs.totalUsd : 0), 0);
  return (
    <Panel code="ASK" title="Ask the committee" id="ask" className="task-panel"
      meta={<span className="ask-meta"><TierTag tier="super" /> {modelName(secretary?.model) ?? "Nemotron Super"}{spent > 0 && <> · <span className="num">{usd(spent)}</span></>}</span>}>
      <div className="ask-box" ref={box} aria-live="polite">
        {msgs.length === 0 && (
          <p className="ask-intro">
            Question the session. Answers come only from this committee's fact sheets, reports and ruling. Figures are checked against them:{" "}
            <mark className="fig fig-traced">in the session</mark>, <mark className="fig fig-flagged">not found</mark>. Research, not advice.
          </p>
        )}
        {msgs.map((m, i) => (
          <div key={m.id} className="ask-turn">
            <div className="ask-q"><span className="ask-prompt" aria-hidden="true">&gt;</span>{m.question}</div>
            {m.status === "pending" && (
              <div className="ask-a is-pending"><span className="spin-dots" aria-hidden="true"><i /><i /><i /></span> Reading the session… <Elapsed since={m.since} /></div>
            )}
            {m.status === "error" && <div className="ask-a ask-error">{m.error}</div>}
            {m.status === "done" && (
              <div className="ask-a">
                <div className="ask-text">
                  <Typed text={m.result.answer.answer} flagged={m.result.untraced} checked animate={i === msgs.length - 1} />
                </div>
                {m.result.answer.basis.length > 0 && (
                  <ul className="ask-basis" aria-label="Figures this answer rests on">
                    {m.result.answer.basis.map((b) => (
                      <li key={b.metric + b.value} title={b.interpretation}><span>{b.metric}</span> <b className="num">{b.value}</b> <i aria-label="traced">✓</i></li>
                    ))}
                  </ul>
                )}
                <div className="ask-foot num">
                  {secs(m.result.costs.calls.reduce((n, c) => n + c.latencyMs, 0))} · {(m.result.costs.totalPromptTokens + m.result.costs.totalCompletionTokens).toLocaleString("en-GB")} tok · {usd(m.result.costs.totalUsd)}
                  {m.result.untraced.length > 0 && <span className="warn"> · {m.result.untraced.length} figure{m.result.untraced.length === 1 ? "" : "s"} not in the session</span>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {suggestions.length > 0 && (
        <div className="ask-suggest">
          {suggestions.map((s) => <button key={s} type="button" className="tchip" disabled={busy} onClick={() => ask(s)}>{s}</button>)}
        </div>
      )}
      <form className="ask-form" onSubmit={submit}>
        <span className="ask-prompt" aria-hidden="true">&gt;</span>
        <label htmlFor="ask-q" className="sr-only">Ask the committee a question</label>
        <input id="ask-q" ref={input} value={q} onChange={(e) => setQ(e.target.value)} maxLength={MAX_CHARS} autoComplete="off"
          placeholder={busy ? "Answering…" : `Ask about ${state.ticker}: why the call, the dissent, the risks…`} disabled={busy} />
        <button type="submit" className="tbtn tbtn-go" disabled={busy || !q.trim()}>Ask ⏎</button>
      </form>
    </Panel>
  );
}
