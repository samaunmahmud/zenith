import { useState } from "react";
import type { CommitteeResult } from "../types";

export function MemoPanel({ result }: { result: CommitteeResult }) {
  const [open, setOpen] = useState(false);

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

  return (
    <div className="panel memo">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Investment memo</h2>
        <div className="row">
          <button className="btn secondary" onClick={() => setOpen((o) => !o)}>
            {open ? "Hide" : "Preview"}
          </button>
          <button className="btn" onClick={download}>
            Download .md
          </button>
        </div>
      </div>
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
      {open && <pre>{result.memoMarkdown}</pre>}
    </div>
  );
}
