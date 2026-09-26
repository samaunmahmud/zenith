import type { Snapshot } from "../indicators/snapshot.js";
import { callStructured } from "../llm/client.js";
import type { CostTracker } from "../llm/costs.js";
import { ChairDecision, type AnalystName, type AnalystReport, type Rebuttal } from "../schemas/committee.js";
import { CHAIR_SYSTEM } from "./prompts/chair.js";
import { reportBlock } from "./rebuttal.js";
import { ANALYST_ORDER, CHAIR } from "./roster.js";

const NAMES_AN_ANALYST = /\b(fundamentals?|technicals?|risk)\b/i;

export function chairInput(snapshot: Snapshot, reports: AnalystReport[], rebuttals: Rebuttal[]): string {
  const missing = ANALYST_ORDER.filter((a) => !reports.some((r) => r.analyst === a));
  const parts = [
    `Stock: ${snapshot.ticker} (${snapshot.companyName}), sector: ${snapshot.sector ?? "not available"}`,
    `Data as of: ${snapshot.asOf}. Last close: ${snapshot.facts.technicals["Last close"]}`,
    "",
    "Analyst reports:",
    ...reports.map(reportBlock),
  ];
  if (missing.length) parts.push("", `Missing reports (analyst failed): ${missing.join(", ")}`);
  if (rebuttals.length) {
    parts.push(
      "",
      "Rebuttal round:",
      ...rebuttals.map(
        (r) => `- ${r.analyst} → ${r.respondingTo}${r.stanceChanged ? " (STANCE CHANGED)" : ""}: ${r.response}`
      )
    );
  }
  parts.push("", "Make the committee's decision as JSON.");
  return parts.join("\n");
}

export async function runChair(
  snapshot: Snapshot,
  reports: AnalystReport[],
  rebuttals: Rebuttal[],
  tracker: CostTracker
): Promise<ChairDecision> {
  const present = new Set<AnalystName>(reports.map((r) => r.analyst));
  return callStructured({
    agent: CHAIR.id,
    tier: CHAIR.tier,
    system: CHAIR_SYSTEM,
    user: chairInput(snapshot, reports, rebuttals),
    schema: ChairDecision,
    schemaName: "ChairDecision",
    temperature: 0.2,
    tracker,
    check: (d) => {
      const problems: string[] = [];
      d.rationale.forEach((point, i) => {
        if (!NAMES_AN_ANALYST.test(point)) problems.push(`rationale[${i}] must name the analyst it draws on, e.g. "[Risk] ..."`);
      });
      if (d.dissent && !present.has(d.dissent.analyst)) {
        problems.push(`dissent.analyst "${d.dissent.analyst}" did not submit a report`);
      }
      return problems;
    },
  });
}
