import { useCallback, useEffect, useReducer, useRef } from "react";
import { streamCommittee } from "../api";
import { committeeReducer, initialState } from "../state/committee";

/** One committee session with no URL handling: the comparison page runs two of these side by side. */
export function useSession() {
  const [state, dispatch] = useReducer(committeeReducer, initialState);
  const stopRef = useRef<(() => void) | null>(null);

  const start = useCallback((ticker: string) => {
    stopRef.current?.();
    dispatch({ type: "start", ticker, rebuttals: false, at: performance.now() });
    stopRef.current = streamCommittee(ticker, false, (event) => dispatch({ type: "event", event, at: performance.now() }));
  }, []);

  // Leaving the page closes the streams; the server then stops any run before its next paid stage.
  useEffect(() => () => stopRef.current?.(), []);

  return { state, start };
}
