import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CommitteeState } from "../state/committee";
import { liveTape, replayTape, type Tape } from "../lib/tape";

/** A replay is compressed to about this long: long enough to watch the committee work, short enough not to wait on it. */
const REPLAY_TARGET_MS = 12_000;
const MAX_SPEED = 12;

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export interface Playback {
  tape: Tape;
  /** Current time on the session clock, ms from the start. */
  t: number;
  mode: "live" | "replay";
  /** Replay speed (1 for live). */
  speed: number;
  /** Nothing left to play: a live run has ended, or a replay has reached its end. */
  finished: boolean;
  skip: () => void;
}

/**
 * Drives the session clock. A live run ticks in real time from its first event. A saved run is played back
 * from its recorded timeline at a fixed, labelled speed, so it reads like the meeting it records.
 */
export function usePlayback(state: CommitteeState): Playback {
  const replay = Boolean(state.result?.replayed);
  const tape = useMemo(() => (replay && state.result ? replayTape(state.result) : liveTape(state)), [replay, state]);
  const speed = replay && tape.total ? Math.min(MAX_SPEED, Math.max(1, tape.total / REPLAY_TARGET_MS)) : 1;
  const session = state.timing.run?.start;

  const [t, setT] = useState(0);
  const origin = useRef<number | null>(null);
  const skipped = useRef(false);

  // A new session starts the clock again.
  useEffect(() => {
    origin.current = null;
    skipped.current = false;
    setT(0);
  }, [session, replay]);

  useEffect(() => {
    if (replay) {
      if (tape.total === null) return;
      if (skipped.current || reducedMotion()) {
        setT(tape.total);
        return;
      }
      let raf = 0;
      const tick = (now: number) => {
        if (origin.current === null) origin.current = now;
        const next = Math.min(tape.total!, (now - origin.current) * speed);
        setT(next);
        if (next < tape.total!) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }
    // Live: real time since the session began, frozen once it ends.
    if (session === undefined) return;
    if (state.status !== "running") {
      setT(tape.total ?? 0);
      return;
    }
    let raf = 0;
    const tick = () => {
      setT(performance.now() - session);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [replay, tape.total, speed, session, state.status]);

  const skip = useCallback(() => {
    skipped.current = true;
    if (tape.total !== null) setT(tape.total);
  }, [tape.total]);

  const finished = replay ? tape.total !== null && t >= tape.total : state.status !== "running" && state.status !== "idle";
  return { tape, t, mode: replay ? "replay" : "live", speed, finished, skip };
}
