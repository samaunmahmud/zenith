import type { Facts, Snapshot } from "../indicators/snapshot.js";
import { callStructured } from "../llm/client.js";
import type { CostTracker } from "../llm/costs.js";
import { AnalystReport, NewsDigest, type AnalystName } from "../schemas/committee.js";
import { allowedNumbers, unsupportedNumbers } from "./numberCheck.js";
import { FUNDAMENTALS_SYSTEM } from "./prompts/fundamentals.js";
import { RISK_SYSTEM } from "./prompts/risk.js";
import { TECHNICALS_SYSTEM } from "./prompts/technicals.js";
import { ANALYSTS } from "./roster.js";

const SYSTEM_PROMPTS: Record<AnalystName, string> = {
  fundamentals: FUNDAMENTALS_SYSTEM,
  technicals: TECHNICALS_SYSTEM,
  risk: RISK_SYSTEM,
};

// Which analysts get the news digest: technicals deliberately works from price data only.
const SEES_NEWS: Record<AnalystName, boolean> = { fundamentals: true, technicals: false, risk: true };

export function factSheet(facts: Facts): string {
  return Object.entries(facts)
    .map(([label, value]) => `- ${label}: ${value}`)
    .join("\n");
}

export function newsBlock(news: NewsDigest | null): string {
  if (!news || news.sentiment === "none") return "Recent news: none available.";
  return [
    `Recent news (summarised by the news desk, sentiment: ${news.sentiment}):`,
    ...news.themes.map((t) => `- Theme: ${t}`),
    ...news.notableEvents.map((e) => `- Event: ${e}`),
  ].join("\n");
}

/** The exact text an analyst sees. Also the source of truth for the "no invented numbers" check. */
export function analystInput(analyst: AnalystName, snapshot: Snapshot, news: NewsDigest | null): string {
  const parts = [
    `Stock: ${snapshot.ticker} (${snapshot.companyName})`,
    `Data as of: ${snapshot.asOf}`,
    "",
    "Input data:",
    factSheet(snapshot.facts[analyst]),
  ];
  if (SEES_NEWS[analyst]) parts.push("", newsBlock(news));
  parts.push("", `Write your ${analyst} report on ${snapshot.ticker} as JSON.`);
  return parts.join("\n");
}

export async function runAnalyst(
  analyst: AnalystName,
  snapshot: Snapshot,
  news: NewsDigest | null,
  tracker: CostTracker
): Promise<AnalystReport> {
  const input = analystInput(analyst, snapshot, news);
  const allowed = allowedNumbers([input]);

  return callStructured({
    agent: analyst,
    tier: ANALYSTS[analyst].tier,
    system: SYSTEM_PROMPTS[analyst],
    user: input,
    schema: AnalystReport,
    schemaName: "AnalystReport",
    temperature: 0.3,
    tracker,
    // Hard checks: right identity, and every evidence value must trace back to the input.
    check: (report) => {
      const problems: string[] = [];
      if (report.analyst !== analyst) problems.push(`"analyst" must be "${analyst}"`);
      for (const e of report.evidence) {
        const bad = unsupportedNumbers(e.value, allowed, false);
        if (bad.length) {
          problems.push(`evidence "${e.metric}" has value "${e.value}" with figures not in the input (${bad.join(", ")}). Copy values exactly from the input.`);
        }
      }
      return problems;
    },
  });
}
