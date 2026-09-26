import type { AppConfig, CommitteeEvent, Health } from "./types";

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

/**
 * Open the SSE stream for one committee run. Returns a function that closes it.
 * EventSource is built into the browser, so streaming needs no extra dependency.
 */
export function streamCommittee(ticker: string, rebuttals: boolean, onEvent: (e: CommitteeEvent) => void): () => void {
  const qs = new URLSearchParams({ ticker, rebuttals: String(rebuttals) });
  const source = new EventSource(`/api/committee/stream?${qs}`);
  let finished = false;

  for (const type of EVENT_TYPES) {
    source.addEventListener(type, (msg) => {
      const event = JSON.parse((msg as MessageEvent<string>).data) as CommitteeEvent;
      if (event.type === "done" || event.type === "error") {
        finished = true;
        source.close();
      }
      onEvent(event);
    });
  }
  // Without this, EventSource would silently reconnect and start a second committee run.
  source.onerror = () => {
    if (finished) return;
    source.close();
    onEvent({ type: "error", message: "Lost connection to the server.", status: 0 });
  };
  return () => source.close();
}
