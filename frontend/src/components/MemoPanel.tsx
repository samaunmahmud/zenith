import { useState } from "react";
import type { CommitteeResult } from "../types";
import { Markdown } from "./Markdown";

type View = "closed" | "document" | "source";

export function MemoPanel({ result }: { result: CommitteeResult }) {
  const [view, setView] = useState<View>("closed");

  const download = () => {
    const blob = new Blob([result.memoMarkdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.ticker}-committee-memo-${result.generatedAt.slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const traced = result.integrity.length === 0;
  const toggle = (v: View) => setView((cur) => (cur === v ? "closed" : v));

  return (
    <div className="panel memo">
      <div className="label">Investment memo</div>
      <p className="small muted" style={{ margin: "8px 0 0" }}>
        Assembled in code from the agents' structured output, so its tables, figures and disclaimer can't be hallucinated.
      </p>
      <div className={`notice ${traced ? "ok" : "warn"}`}>
        {traced ? (
          <>✓ Every figure in the agents' output traces back to the computed input data.</>
        ) : (
          <>
            ⚠ Some figures couldn't be traced to the input data:{" "}
            {result.integrity.map((f) => `${f.agent} (${f.figures.join(", ")})`).join("; ")}. Treat them with caution.
          </>
        )}
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn" onClick={download}>
          Download memo (.md)
        </button>
        <button className="btn ghost" aria-pressed={view === "document"} onClick={() => toggle("document")}>
          {view === "document" ? "Hide memo" : "Read memo"}
        </button>
        <button className="linkish" aria-pressed={view === "source"} onClick={() => toggle("source")}>
          {view === "source" ? "Hide source" : "View Markdown"}
        </button>
      </div>
      {view === "document" && (
        <div className="memo-doc">
          <Markdown source={result.memoMarkdown} />
        </div>
      )}
      {view === "source" && <pre>{result.memoMarkdown}</pre>}
    </div>
  );
}
