import { callStructured } from "../llm/client.js";
import type { CostTracker } from "../llm/costs.js";
import { Rebuttal, type AnalystName, type AnalystReport } from "../schemas/committee.js";
import { REBUTTAL_SYSTEM } from "./prompts/rebuttal.js";
import { ANALYSTS } from "./roster.js";

export function reportBlock(r: AnalystReport): string {
  return [
    `## ${r.analyst} analyst: ${r.stance} (confidence ${r.confidence.toFixed(2)})`,
    `Headline: ${r.headline}`,
    `Key points:\n${r.keyPoints.map((p) => `- ${p}`).join("\n")}`,
    `Evidence:\n${r.evidence.map((e) => `- ${e.metric}: ${e.value}. ${e.interpretation}`).join("\n")}`,
    `Concerns:\n${r.concerns.length ? r.concerns.map((c) => `- ${c}`).join("\n") : "- none stated"}`,
  ].join("\n");
}

/** One rebuttal from one analyst. Exactly one round: nobody responds to a rebuttal. */
export async function runRebuttal(
  analyst: AnalystName,
  ticker: string,
  reports: AnalystReport[],
  tracker: CostTracker
): Promise<Rebuttal> {
  const own = reports.find((r) => r.analyst === analyst)!;
  const others = reports.filter((r) => r.analyst !== analyst);
  return callStructured({
    agent: `${analyst}-rebuttal`,
    tier: ANALYSTS[analyst].tier,
    system: REBUTTAL_SYSTEM(analyst),
    user: [
      `Stock: ${ticker}`,
      "",
      "Your report:",
      reportBlock(own),
      "",
      "Your colleagues' reports:",
      ...others.map(reportBlock),
      "",
      "Write your one rebuttal as JSON.",
    ].join("\n"),
    schema: Rebuttal,
    schemaName: "Rebuttal",
    temperature: 0.3,
    tracker,
    check: (r) => {
      const problems: string[] = [];
      if (r.analyst !== analyst) problems.push(`"analyst" must be "${analyst}"`);
      if (!others.some((o) => o.analyst === r.respondingTo)) {
        problems.push(`"respondingTo" must be one of: ${others.map((o) => o.analyst).join(", ")}`);
      }
      return problems;
    },
  });
}
