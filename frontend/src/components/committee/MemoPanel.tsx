import { useState } from "react";
import type { CommitteeResult } from "../../types";
import { Card } from "../ui/Card";
import { Markdown } from "./Markdown";

export function downloadMemo(result: CommitteeResult) {
  const blob = new Blob([result.memoMarkdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${result.ticker}-committee-memo-${result.generatedAt.slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

/** The investment memo: an integrity summary, then the memo as a document (or its Markdown source). */
export function MemoPanel({ result }: { result: CommitteeResult }) {
  const [source, setSource] = useState(false);
  const traced = result.integrity.length === 0;

  return (
    <div className="stack-16">
      <div className={`notice ${traced ? "ok" : "warn"}`}>
        <div>
          {traced ? (
            <><b>Every figure traces back to the input.</b> The agents only quoted numbers computed in code.</>
          ) : (
            <>
              <b>Some figures couldn't be traced to the input data:</b>{" "}
              {result.integrity.map((f) => `${f.agent} (${f.figures.join(", ")})`).join("; ")}. Treat them with caution.
            </>
          )}
          <div className="xs dim" style={{ marginTop: 2 }}>
            The memo is assembled in code from the agents' structured output, so its tables, figures and disclaimer can't be hallucinated.
          </div>
        </div>
      </div>
      <Card
        title="Investment memo"
        sub={`${result.ticker} · ${result.generatedAt.slice(0, 10)}`}
        actions={
          <>
            <button className="btn btn-sm btn-ghost" aria-pressed={source} onClick={() => setSource((s) => !s)}>
              {source ? "Document" : "Markdown source"}
            </button>
            <button className="btn btn-sm btn-primary" onClick={() => downloadMemo(result)}>Download .md</button>
          </>
        }
        flush={source}
      >
        {source ? (
          <pre className="memo-source">{result.memoMarkdown}</pre>
        ) : (
          <div className="memo-doc">
            <Markdown source={result.memoMarkdown} />
          </div>
        )}
      </Card>
    </div>
  );
}
