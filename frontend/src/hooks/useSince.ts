import { useEffect, useState } from "react";
import { fetchSince } from "../api";
import type { Since } from "../types";

/** How a saved ruling has aged, fetched once per session when {@code enabled}. Null until loaded or when there's nothing. */
export function useSince(ticker: string, session: string | undefined, enabled: boolean): Since | null {
  const [since, setSince] = useState<Since | null>(null);
  useEffect(() => {
    setSince(null);
    if (!enabled) return;
    let live = true;
    fetchSince(ticker).then((s) => live && setSince(s));
    return () => {
      live = false;
    };
  }, [ticker, session, enabled]);
  return since;
}
