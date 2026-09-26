import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const KEY = "zenith-theme";
const darkQuery = () => window.matchMedia?.("(prefers-color-scheme: dark)");

/** The theme in effect: the visitor's saved choice (set on <html> by index.html), else the system's. */
function current(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return darkQuery()?.matches ? "dark" : "light";
}

/**
 * Light / dark theme. Follows the system until the visitor picks one; the pick is remembered.
 * Storage can be unavailable (private windows, blocked cookies), so every access is guarded.
 */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(current);

  // While there's no saved choice, track system changes live.
  useEffect(() => {
    const q = darkQuery();
    if (!q) return;
    const onChange = () => {
      if (!document.documentElement.dataset.theme) setTheme(q.matches ? "dark" : "light");
    };
    q.addEventListener("change", onChange);
    return () => q.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = current() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* not persisted; still applies for this visit */
    }
    setTheme(next);
  }, []);

  return [theme, toggle];
}
