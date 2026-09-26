import { useEffect, useState } from "react";
import { fetchHealth } from "../api";
import type { Health } from "../types";

/** Live-AI availability for the status pill. Re-checked whenever `refreshKey` changes (e.g. after each run). */
export function useHealth(refreshKey: unknown) {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    let alive = true;
    fetchHealth().then((h) => alive && setHealth(h));
    return () => {
      alive = false;
    };
  }, [refreshKey]);
  return health;
}

/** Whether a new live run could spend: key configured and budget left. */
export const aiLive = (h: Health | null) => Boolean(h?.keys.tokenFactory && h.budget.spentUsd < h.budget.maxUsd);
