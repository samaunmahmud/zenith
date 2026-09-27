import { useCallback, useMemo } from "react";
import type { CommitteeState } from "../state/committee";
import type { ChairDecision, Stage } from "../types";
import { buildMinutes, gist, latestSaid, seatStates, type Entry, type Seat, type SeatState } from "../lib/minutes";
import { useReveal } from "./useReveal";

const FLOOR: Record<Seat, string> = {
  clerk: "The Clerk",
  news: "The news desk",
  fundamentals: "Fundamentals",
  technicals: "Technicals",
  risk: "Risk",
  chair: "The Chair",
};

const STAGE_TEXT: Record<Stage, string> = {
  data: "The Clerk is computing every indicator in Java",
  news: "The news desk is reading the headlines",
  analysts: "Three analysts are working in parallel",
  rebuttals: "Rebuttal round: one reply each",
  chair: "The Chair is weighing the arguments",
  memo: "Writing up the minutes",
};

export interface Meeting {
  entries: Entry[];
  /** The statements read into the minutes so far. */
  onScreen: Entry[];
  shown: number;
  /** More statements are still waiting to be read out. */
  pending: boolean;
  skip: () => void;
  states: Record<Seat, SeatState>;
  said: Partial<Record<Seat, Entry>>;
  /** The seat about to speak (or still working), if any. */
  next: Seat | null;
  /** What the table centre shows before the ruling. */
  caption: { title: string; line?: string } | null;
  /** The chair's ruling, once it has been read out. */
  decision: ChairDecision | null;
}

/**
 * One session played as a meeting: statements are read out one at a time, seats light up as they speak, and the
 * ruling lands only when the chair's turn comes. The boardroom and each side of a comparison use the same timing.
 */
export function useMeeting(state: CommitteeState): Meeting {
  const entries = useMemo(() => buildMinutes(state), [state]);
  const isRuling = useCallback((i: number) => entries[i]?.kind === "ruling", [entries]);
  const { shown, skip, pending } = useReveal(entries.length, state.timing.run?.start, isRuling);
  const onScreen = entries.slice(0, shown);
  const states = seatStates(state, entries, shown);
  const running = state.status === "running";

  const ruled = onScreen.find((e) => e.kind === "ruling");
  const decision = ruled?.kind === "ruling" ? ruled.decision : null;
  const next = pending ? entries[shown].seat : running ? (Object.entries(states).find(([, v]) => v === "thinking")?.[0] as Seat | undefined) ?? null : null;
  const last = onScreen[onScreen.length - 1];

  // The table centre: whoever last spoke and the gist of it; before anyone has, what the committee is doing.
  let caption: Meeting["caption"] = null;
  if (last) caption = { title: `${FLOOR[last.seat]} has the floor`, line: gist(last) };
  else if (running && state.stage) caption = { title: STAGE_TEXT[state.stage] };
  else if (next) caption = { title: `${FLOOR[next]} is about to speak` };
  if (state.status === "error" && !pending) caption = { title: "Adjourned", line: state.error ?? undefined };

  return { entries, onScreen, shown, pending, skip, states, said: latestSaid(onScreen), next, caption, decision };
}
