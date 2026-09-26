import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "./Markdown";

const html = (source: string) => renderToStaticMarkup(<Markdown source={source} />);

describe("Markdown (memo renderer)", () => {
  it("escapes model-written text instead of injecting it as markup", () => {
    const out = html("Chair says <script>alert(1)</script> and <img src=x onerror=alert(1)>");
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;script&gt;");
  });

  it("renders headings, lists, blockquotes and rules", () => {
    const out = html("# Memo\n\n## Decision: BUY\n\n- one\n- two\n\n> **Risk analyst:** too volatile\n\n---");
    expect(out).toContain("<h1>Memo</h1>");
    expect(out).toContain("<h2>Decision: BUY</h2>");
    expect(out).toContain("<ul><li>one</li><li>two</li></ul>");
    expect(out).toContain("<blockquote><strong>Risk analyst:</strong> too volatile</blockquote>");
    expect(out).toContain("<hr/>");
  });

  it("renders tables and drops the separator row", () => {
    const out = html("| Metric | Value |\n|---|---|\n| RSI (14) | **61.2** |");
    expect(out).toContain("<th>Metric</th><th>Value</th>");
    expect(out).toContain("<td>RSI (14)</td><td><strong>61.2</strong></td>");
    expect(out).not.toContain("---");
  });

  it("treats underscores inside words as text, not italics", () => {
    const out = html("Set MAX_SPEND_USD, then _read this_.");
    expect(out).toContain("MAX_SPEND_USD");
    expect(out).toContain("<em>read this</em>");
  });

  it("survives a table made only of separator rows", () => {
    expect(() => html("Before\n|---|---|\nAfter")).not.toThrow();
    expect(html("Before\n|---|---|\nAfter")).toContain("<p>After</p>");
  });
});
