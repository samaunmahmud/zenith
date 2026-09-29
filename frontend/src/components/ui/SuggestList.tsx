import type { SymbolMatch } from "../../types";

interface Props {
  id: string;
  matches: SymbolMatch[];
  active: number;
  onPick: (m: SymbolMatch) => void;
}

/** The dropdown under a search box: ticker, company and exchange for each match. */
export function SuggestList({ id, matches, active, onPick }: Props) {
  return (
    <ul className="suggest" id={id} role="listbox" aria-label="Matching stocks">
      {matches.map((m, i) => (
        <li key={m.symbol} id={`${id}-${i}`} role="option" aria-selected={i === active} className={i === active ? "is-active" : ""}
          // mousedown, not click: it fires before the input's blur closes the list.
          onMouseDown={(e) => { e.preventDefault(); onPick(m); }}>
          <b className="num">{m.symbol}</b>
          <span className="sg-name">{m.name}</span>
          <span className="sg-ex">{m.exchange}</span>
        </li>
      ))}
    </ul>
  );
}
