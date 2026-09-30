import type { AppConfig, AskResult, AskTurn, CommitteeEvent, Health, Since, SymbolMatch, TapeRow, ThesisResult, TrackRecord } from "./types";

export async function fetchConfig(): Promise<AppConfig | null> {
  try {
    const res = await fetch("/api/config");
    return res.ok ? ((await res.json()) as AppConfig) : null;
  } catch {
    return null;
  }
}

export async function fetchHealth(): Promise<Health | null> {
  try {
    const res = await fetch("/api/health");
    return res.ok ? ((await res.json()) as Health) : null;
  } catch {
    return null;
  }
}

/** Stocks matching a ticker or company name. Empty on failure or when cancelled: suggestions are a convenience. */
export async function searchSymbols(q: string, signal?: AbortSignal): Promise<SymbolMatch[]> {
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal });
    return res.ok ? ((await res.json()) as SymbolMatch[]) : [];
  } catch {
    return [];
  }
}

/** The landing tape. Empty on failure: the tape is decoration, never a reason for the page to break. */
export async function fetchTape(): Promise<TapeRow[]> {
  try {
    const res = await fetch("/api/tape");
    return res.ok ? ((await res.json()) as TapeRow[]) : [];
  } catch {
    return [];
  }
}

/** How the saved ruling on a stock has aged. Null when there's nothing to say (no saved ruling, no prices, or a failure). */
export async function fetchSince(ticker: string): Promise<Since | null> {
  try {
    const res = await fetch(`/api/since?ticker=${encodeURIComponent(ticker)}`);
    return res.status === 200 ? ((await res.json()) as Since) : null;
  } catch {
    return null;
  }
}

export async function fetchTrackRecord(): Promise<TrackRecord> {
  const res = await fetch("/api/track-record");
  if (!res.ok) throw new Error(`The track record couldn't be loaded (HTTP ${res.status}).`);
  return (await res.json()) as TrackRecord;
}

/** Asks the chair to cross-examine the investor's thesis. Errors carry the server's message for the visitor. */
export async function postThesis(ticker: string, thesis: string): Promise<ThesisResult> {
  let res: Response;
  try {
    res = await fetch("/api/thesis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker, thesis }) });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `The review failed (HTTP ${res.status}).`);
  return body as ThesisResult;
}

/** Asks the committee secretary a follow-up question about the latest session on a stock. */
export async function postAsk(ticker: string, question: string, history: AskTurn[]): Promise<AskResult> {
  let res: Response;
  try {
    res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker, question, history }) });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `The question failed (HTTP ${res.status}).`);
  return body as AskResult;
}

const EVENT_TYPES: CommitteeEvent["type"][] = [
  "stage",
  "snapshot",
  "news",
  "report",
  "analystError",
  "rebuttal",
  "decision",
  "done",
  "error",
];

/** One SSE data payload as a committee event, or null if it isn't one (never throws). */
export function parseEvent(data: unknown): CommitteeEvent | null {
  if (typeof data !== "string") return null;
  try {
    const event = JSON.parse(data) as CommitteeEvent;
    return event && typeof event === "object" && EVENT_TYPES.includes(event.type) ? event : null;
  } catch {
    return null;
  }
}

/**
 * Open the SSE stream for one committee run. Returns a function that closes it.
 * EventSource is built into the browser, so streaming needs no extra dependency.
 */
export function streamCommittee(ticker: string, rebuttals: boolean, onEvent: (e: CommitteeEvent) => void): () => void {
  const qs = new URLSearchParams({ ticker, rebuttals: String(rebuttals) });
  const source = new EventSource(`/api/committee/stream?${qs}`);
  let finished = false;

  const finish = (event: CommitteeEvent) => {
    finished = true;
    source.close();
    onEvent(event);
  };

  for (const type of EVENT_TYPES) {
    source.addEventListener(type, (msg) => {
      // The browser's own connection-error Event also arrives on the "error" listener, with no data:
      // leave that to onerror below.
      if (finished || !(msg instanceof MessageEvent)) return;
      const event = parseEvent(msg.data);
      if (!event) return finish({ type: "error", message: "The server sent a malformed update.", status: 0 });
      if (event.type === "done" || event.type === "error") return finish(event);
      onEvent(event);
    });
  }
  // Without this, EventSource would silently reconnect and start a second committee run.
  source.onerror = () => {
    if (!finished) finish({ type: "error", message: "Lost connection to the server.", status: 0 });
  };
  return () => source.close();
}
