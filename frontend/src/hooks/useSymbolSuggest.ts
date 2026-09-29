import { useEffect, useState, type KeyboardEvent } from "react";
import { searchSymbols } from "../api";
import type { SymbolMatch } from "../types";

const DEBOUNCE_MS = 220;

/**
 * Suggestions for a search box: stocks matching what's typed, by ticker or company name. Waits for a pause in typing,
 * and cancels a request that's been overtaken, so a slow answer for "sa" never replaces the one for "sandisk".
 * `onKeyDown` gives the list arrow-key navigation; Enter picks the highlighted match, Escape closes the list.
 */
export function useSymbolSuggest(query: string, onPick: (m: SymbolMatch) => void) {
  const [matches, setMatches] = useState<SymbolMatch[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = query.trim();
    // Commands and flags ("record", "--no-rebuttals") aren't worth a lookup; neither is an empty box.
    if (!q || q.startsWith("-") || q.includes(" --")) {
      setMatches([]);
      return;
    }
    const ctrl = new AbortController();
    const id = window.setTimeout(() => {
      searchSymbols(q, ctrl.signal).then((m) => {
        if (ctrl.signal.aborted) return;
        setMatches(m);
        setActive(-1);
      });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(id);
      ctrl.abort();
    };
  }, [query]);

  const shown = open && matches.length > 0;

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!shown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? matches.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      setOpen(false);
      onPick(matches[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return { matches, active, shown, setOpen, onKeyDown };
}
