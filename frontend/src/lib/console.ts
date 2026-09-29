import type { AgentModel, Health, TapeRow, Tier } from "../types";
import { TIER_LABEL, usd } from "./format";

/** What a line typed into the landing console asks for. */
export type Command =
  | { kind: "convene"; ticker: string; rebuttals: boolean | null }
  | { kind: "page"; page: "record" | "compare" }
  | { kind: "rebuttals"; on: boolean }
  | { kind: "help" }
  | { kind: "clear" }
  | { kind: "none" }
  | { kind: "error"; message: string };

const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;

/**
 * Parses a console line. A bare ticker convenes the committee; `convene`/`run` may precede it, and
 * `--rebuttals` / `--no-rebuttals` override the session's rebuttal setting for that run only.
 */
export function parseCommand(line: string): Command {
  const words = line.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { kind: "none" };
  const [head, ...rest] = words.map((w) => w.toLowerCase());

  if (head === "help" || head === "?") return { kind: "help" };
  if (head === "clear" || head === "cls") return { kind: "clear" };
  if (head === "record" || head === "track") return { kind: "page", page: "record" };
  if (head === "compare") return { kind: "page", page: "compare" };
  if (head === "rebuttals") {
    if (rest[0] === "on" || rest[0] === "off") return { kind: "rebuttals", on: rest[0] === "on" };
    return { kind: "error", message: "usage: rebuttals on|off" };
  }

  const args = head === "convene" || head === "run" ? words.slice(1) : words;
  const flags = args.filter((a) => a.startsWith("--")).map((a) => a.toLowerCase());
  const plain = args.filter((a) => !a.startsWith("--"));
  const unknown = flags.find((f) => f !== "--rebuttals" && f !== "--no-rebuttals");
  if (unknown) return { kind: "error", message: `unknown option ${unknown}` };
  if (plain.length !== 1) return { kind: "error", message: plain.length === 0 ? "convene what? e.g. convene AAPL" : `one ticker at a time, e.g. ${plain[0].toUpperCase()}` };

  const ticker = plain[0].toUpperCase();
  if (!TICKER.test(ticker)) return { kind: "error", message: `not a ticker: ${plain[0]}. Try help` };
  const rebuttals = flags.includes("--no-rebuttals") ? false : flags.includes("--rebuttals") ? true : null;
  return { kind: "convene", ticker, rebuttals };
}

export type BootStatus = "ok" | "warn" | "wait";

export interface BootLine {
  status: BootStatus;
  label: string;
  detail: string;
}

const TIERS: Tier[] = ["nano", "super", "ultra"];

/** The start-up checks, each stated from real config: which model holds which seat, the budget, the cache. */
export function bootLines(agents: AgentModel[], health: Health | null, tape: TapeRow[] | null): BootLine[] {
  const lines: BootLine[] = [{ status: "ok", label: "clerk", detail: "Java 21 · every indicator computed in code, before any model" }];

  for (const tier of TIERS) {
    const seats = agents.filter((a) => a.tier === tier).map((a) => a.label.toLowerCase());
    if (seats.length > 0) lines.push({ status: "ok", label: TIER_LABEL[tier].toLowerCase(), detail: seats.join(", ") });
  }
  if (agents.length === 0) lines.push({ status: "wait", label: "roster", detail: "loading…" });

  if (!health) {
    lines.push({ status: "wait", label: "token factory", detail: "checking…" });
  } else {
    const spend = `${usd(health.budget.spentUsd)} of ${usd(health.budget.maxUsd)} spent`;
    if (health.budget.maxUsd <= 0) lines.push({ status: "warn", label: "token factory", detail: "spend cap is $0: saved sessions only" });
    else if (!health.keys.tokenFactory) lines.push({ status: "warn", label: "token factory", detail: "no key: saved sessions only" });
    else if (health.budget.spentUsd >= health.budget.maxUsd) lines.push({ status: "warn", label: "token factory", detail: `budget used (${spend}): saved sessions only` });
    else lines.push({ status: "ok", label: "token factory", detail: `live · ${spend}` });
  }

  if (!tape) {
    lines.push({ status: "wait", label: "market cache", detail: "reading…" });
  } else if (tape.length === 0) {
    lines.push({ status: "warn", label: "market cache", detail: "empty: run npm run precache" });
  } else {
    const latest = tape.map((r) => r.asOf).sort().at(-1)!;
    lines.push({ status: "ok", label: "market cache", detail: `${tape.length} stocks on file · closes to ${latest}${health?.demoMode ? " · demo mode" : ""}` });
  }

  lines.push({ status: "ok", label: "guards", detail: "JSON schema, 1 retry · figures traced · hard spend cap" });
  return lines;
}
