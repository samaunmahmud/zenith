import type { ReactNode } from "react";

/**
 * Renders the small Markdown subset the backend's MemoBuilder emits: headings, paragraphs, lists,
 * blockquotes, rules, tables, **bold** and _italic_. It builds React elements rather than an HTML string,
 * so model-written text is always escaped: nothing in a memo can inject markup.
 */
export function Markdown({ source }: { source: string }) {
  const lines = source.split("\n");
  const out: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const key = out.length;

    if (!line.trim()) {
      i++;
    } else if (/^#{1,3} /.test(line)) {
      const level = line.indexOf(" ");
      const text = inline(line.slice(level + 1));
      out.push(level === 1 ? <h1 key={key}>{text}</h1> : level === 2 ? <h2 key={key}>{text}</h2> : <h3 key={key}>{text}</h3>);
      i++;
    } else if (/^---+$/.test(line.trim())) {
      out.push(<hr key={key} />);
      i++;
    } else if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells); // skip the |---| separator row
        i++;
      }
      const [head, ...body] = rows;
      if (!head) continue; // a lone |---| line: nothing to show
      out.push(
        <div className="table-wrap" key={key}>
          <table>
            <thead><tr>{head.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead>
            <tbody>{body.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
    } else if (/^[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) items.push(lines[i++].slice(2));
      out.push(<ul key={key}>{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>);
    } else if (line.startsWith(">")) {
      const quoted: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) quoted.push(lines[i++].replace(/^>\s?/, ""));
      out.push(<blockquote key={key}>{inline(quoted.join(" "))}</blockquote>);
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,3} |[-*] |>|\||---+$)/.test(lines[i])) para.push(lines[i++]);
      out.push(<p key={key}>{inline(para.join(" "))}</p>);
    }
  }
  return <div className="markdown">{out}</div>;
}

/** **bold** and _italic_ (either may contain the other's markers as plain text). */
function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|(?<![\w])_(.+?)_(?![\w])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(m[1] !== undefined ? <strong key={m.index}>{inline(m[1])}</strong> : <em key={m.index}>{inline(m[2])}</em>);
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
