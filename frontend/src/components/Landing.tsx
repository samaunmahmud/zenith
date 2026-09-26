import type { AgentModel } from "../types";
import { Roster } from "./Roster";

const STEPS = [
  { n: "01", title: "Compute", text: "Prices, fundamentals and news are fetched, then every indicator (RSI, MACD, moving averages, volatility, beta, P/E) is calculated in Java." },
  { n: "02", title: "Argue", text: "Three analysts on Nemotron Nano and Super each take a position, citing only the computed figures. Every number is traced back to the input." },
  { n: "03", title: "Rebut", text: "Optionally, each analyst gets one short reply to the colleague it disagrees with most. One round, no endless loops." },
  { n: "04", title: "Decide", text: "The chair on Nemotron Ultra weighs the arguments, makes a BUY / HOLD / SELL call and records the strongest dissent." },
];

const GUARDRAILS = [
  { title: "Code calculates", text: "Models never do arithmetic. They receive a fact sheet of figures computed in Java and are told to quote only those." },
  { title: "Schema-constrained", text: "Every reply must match a JSON schema generated from the Java records, then pass validation. One retry with the errors fed back, never more." },
  { title: "Numbers are traced", text: "Each figure an analyst cites is matched against its input (allowing for rounding). Untraceable evidence is rejected; untraceable prose is flagged." },
  { title: "Hard spending cap", text: "The running spend is checked before every call and persisted across restarts. Once the cap is reached, model calls are refused, so a public demo can't run up a bill." },
];

export function Landing({ agents }: { agents: AgentModel[] }) {
  return (
    <>
      <section className="section">
        <div className="stats-band num">
          <div><b>5</b><span>AI agents on the committee</span></div>
          <div><b>3</b><span>Nemotron model sizes: Nano, Super, Ultra</span></div>
          <div><b>100%</b><span>of indicators calculated in code, not by a model</span></div>
          <div><b>1</b><span>auditable memo per decision, with its cost</span></div>
        </div>
      </section>

      <section className="section" id="how">
        <div className="section-head">
          <h2>How the committee works</h2>
          <p>LLMs interpret, code calculates. The models don't calculate anything: they argue about figures computed deterministically from market data, and every figure they cite is checked.</p>
        </div>
        <div className="steps">
          {STEPS.map((s) => (
            <div className="step-card" key={s.n}>
              <div className="n">{s.n}</div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section" id="guardrails">
        <div className="section-head">
          <h2>Guardrails, not vibes</h2>
          <p>An AI committee is only useful if you can check it. These rules are enforced in code, on every run.</p>
        </div>
        <div className="guardrails">
          {GUARDRAILS.map((g) => (
            <div className="guardrail" key={g.title}>
              <span className="check" aria-hidden="true">✓</span>
              <div>
                <h3>{g.title}</h3>
                <p>{g.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section" id="committee">
        <div className="section-head">
          <h2>Who's on the committee</h2>
          <p>Reasoning is spent where it matters: fast Nano for narrow tasks, Super for weighing evidence, and a single Ultra call for the final judgement.</p>
        </div>
        <Roster agents={agents} />
      </section>
    </>
  );
}
