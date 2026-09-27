import { useState, type FormEvent } from "react";
import { postThesis } from "../../api";
import { ANALYST_TITLE, secs, usd, when } from "../../lib/format";
import type { CommitteeState } from "../../state/committee";
import type { ThesisResult, ThesisVerdict } from "../../types";
import { Card } from "../ui/Card";

const MIN = 20;
const MAX = 1200;

const VERDICT: Record<ThesisVerdict, { label: string; tone: string; line: string }> = {
  supported: { label: "Supported", tone: "pos", line: "The committee's figures back your thesis." },
  partly_supported: { label: "Partly supported", tone: "warn", line: "Some of your thesis holds up; some doesn't." },
  contradicted: { label: "Contradicted", tone: "neg", line: "The committee's figures point the other way." },
  untestable: { label: "Can't be tested", tone: "muted", line: "Your thesis makes no claim the fact sheets can check." },
};

const ASSESSMENT = { supported: "pos", contradicted: "neg", unverifiable: "muted" } as const;

const EXAMPLES = [
  "Margins are strong and the business keeps growing, so the current valuation is justified and I'm buying.",
  "The stock has run too far, too fast. Momentum is fading and I expect a pullback, so I'm selling.",
];

function download(result: ThesisResult) {
  const url = URL.createObjectURL(new Blob([result.memoMarkdown], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${result.ticker}-counter-thesis-${result.generatedAt.slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  state: CommitteeState;
  /** The last review for this ticker, kept by the workspace so switching tabs doesn't lose it. */
  result: ThesisResult | null;
  onResult: (r: ThesisResult) => void;
}

/**
 * Devil's advocate: the visitor writes their own case, and the chair cross-examines it against this session's
 * fact sheets, then argues the strongest case against it.
 */
export function ThesisTab({ state, result, onResult }: Props) {
  const [text, setText] = useState(result?.thesis ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = state.status !== "running" && state.decision !== null;
  const length = text.trim().length;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || length < MIN || length > MAX) return;
    setBusy(true);
    setError(null);
    try {
      onResult(await postThesis(state.ticker, text));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <Card>
        <div className="empty">
          <b>{state.status === "running" ? "Your thesis can be tested once the chair has decided." : "No decision to test against."}</b>
          The chair cross-examines your view using this session's fact sheets, so it needs a finished session.
        </div>
      </Card>
    );
  }

  const verdict = result ? VERDICT[result.review.verdict] : null;
  const call = result?.costs.calls[0];

  return (
    <div className="thesis">
      <form className="card thesis-form" onSubmit={submit}>
        <div className="card-body stack">
          <div>
            <h2 className="thesis-title">What's your case on {state.ticker}?</h2>
            <p className="muted small">
              Write what you think and why. The chair will check each claim against the figures the analysts were given,
              then argue the strongest case against you.
            </p>
          </div>
          <label htmlFor="thesis" className="sr-only">Your thesis</label>
          <textarea
            id="thesis"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={MAX + 200}
            placeholder={EXAMPLES[0]}
            disabled={busy}
          />
          <div className="thesis-actions">
            <span className={`xs num ${length > MAX ? "neg" : "dim"}`}>{length}/{MAX}</span>
            {!text && (
              <span className="xs dim">
                Or try{" "}
                <button type="button" className="linkish xs" onClick={() => setText(EXAMPLES[0])}>a bull case</button>
                {" · "}
                <button type="button" className="linkish xs" onClick={() => setText(EXAMPLES[1])}>a bear case</button>
              </span>
            )}
            <span className="xs dim" style={{ marginLeft: "auto" }}>One Nemotron Ultra call, about 1¢</span>
            <button className="btn btn-primary" type="submit" disabled={busy || length < MIN || length > MAX}>
              {busy ? <><span className="spinner" aria-hidden="true" /> Cross-examining…</> : "Cross-examine it"}
            </button>
          </div>
          {error && <div className="notice error" role="alert"><div>{error}</div></div>}
        </div>
      </form>

      {result && verdict && (
        <section className="thesis-result" aria-live="polite">
          <div className={`thesis-verdict tone-${verdict.tone}`}>
            <div className="label">The chair's verdict on your thesis</div>
            <div className="thesis-verdict-row">
              <span className="thesis-verdict-word">{verdict.label}</span>
              <span className="muted">{verdict.line}</span>
            </div>
            <p className="thesis-summary">{result.review.summary}</p>
            <p className="xs dim">
              Tested against the committee's session of {when(result.sessionAt)} (its call: {result.call})
              {call && <> · {secs(call.latencyMs)} · {usd(result.costs.totalUsd)}</>}
            </p>
            <button type="button" className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => download(result)}>
              Download the Counter-Thesis Memo
            </button>
          </div>

          <Card title="Claim by claim" sub="Each claim checked against the fact sheets" flush>
            <ul className="claims">
              {result.review.claims.map((c, i) => (
                <li key={i}>
                  <span className={`claim-mark tone-${ASSESSMENT[c.assessment]}`}>{c.assessment}</span>
                  <div>
                    <b>{c.claim}</b>
                    <p className="small muted">
                      {c.analyst && <span className={`src-tag id-${c.analyst}`}>{ANALYST_TITLE[c.analyst]}</span>}
                      {c.evidence}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <div className="counter">
            <div className="label">The case against you</div>
            <p>{result.review.counterThesis}</p>
          </div>

          <div className="grid">
            <div className="col-6">
              <Card title="Blind spots" sub="What the thesis leaves out">
                <ul className="events">{result.review.blindSpots.map((b) => <li key={b}>{b}</li>)}</ul>
              </Card>
            </div>
            <div className="col-6">
              <Card title="What would change it" sub="Signals to watch">
                <ul className="events">{result.review.whatWouldChangeIt.map((w) => <li key={w}>{w}</li>)}</ul>
              </Card>
            </div>
          </div>

          {result.untraced.length > 0 && (
            <div className="notice warn"><div><b>Some figures couldn't be traced</b> to the committee's data or your thesis: {result.untraced.join(", ")}. Treat them with caution.</div></div>
          )}

        </section>
      )}
    </div>
  );
}
