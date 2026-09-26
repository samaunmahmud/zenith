import { useEffect, useState } from "react";

/** Current performance.now(), re-rendering every 100 ms while `active` (the floor's live clocks). */
export function useNow(active: boolean) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}
