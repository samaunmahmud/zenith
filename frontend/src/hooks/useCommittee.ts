import { useCallback, useEffect, useReducer, useRef } from "react";
import { streamCommittee } from "../api";
import { committeeReducer, initialState } from "../state/committee";

/**
 * Owns one committee session: starts the SSE stream, feeds events to the reducer, keeps the URL shareable
 * (/?ticker=NVDA&rebuttals=true) and resumes a run from the URL on first load.
 */
export function useCommittee() {
  const [state, dispatch] = useReducer(committeeReducer, initialState);
  const stopRef = useRef<(() => void) | null>(null);
  const runningRef = useRef(false);
  runningRef.current = state.status === "running";
  const tickerRef = useRef("");
  tickerRef.current = state.ticker;

  const convene = useCallback((raw: string, rebuttals: boolean) => {
    const ticker = raw.trim().toUpperCase();
    if (!ticker || runningRef.current) return;
    runningRef.current = true; // block a double submit before React re-renders
    stopRef.current?.();
    dispatch({ type: "start", ticker, rebuttals, at: performance.now() });
    const qs = new URLSearchParams({ ticker, ...(rebuttals ? { rebuttals: "true" } : {}) });
    window.history.pushState(null, "", `?${qs}`);
    stopRef.current = streamCommittee(ticker, rebuttals, (event) => dispatch({ type: "event", event, at: performance.now() }));
  }, []);

  const reset = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    if (window.location.search) window.history.pushState(null, "", window.location.pathname);
    dispatch({ type: "reset" });
  }, []);

  // Start from the URL once. The ref guard matters: React StrictMode runs effects twice in development,
  // which would otherwise start (and pay for) two committee runs.
  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const ticker = params.get("ticker");
    if (ticker) convene(ticker, params.get("rebuttals") === "true");
  }, [convene]);

  // Browser back/forward: anything but the ticker on screen returns home. It never starts a run by itself,
  // since a run costs money; the visitor can convene again with one click.
  useEffect(() => {
    const onPop = () => {
      const ticker = new URLSearchParams(window.location.search).get("ticker")?.toUpperCase() ?? "";
      if (ticker !== tickerRef.current) {
        stopRef.current?.();
        stopRef.current = null;
        if (ticker) window.history.replaceState(null, "", window.location.pathname);
        dispatch({ type: "reset" });
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // No unmount cleanup that closes the stream: under StrictMode (dev) React mounts, unmounts and remounts,
  // and closing here would kill the run the first mount started. The app never unmounts; the browser
  // closes the stream on unload.

  return { state, convene, reset };
}
