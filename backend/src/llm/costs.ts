import type { ModelTier } from "../config.js";
import type { CallCost } from "../schemas/committee.js";

export interface Pricing {
  input: number; // USD per 1M prompt tokens
  output: number; // USD per 1M completion tokens
}

export function estimateCostUsd(promptTokens: number, completionTokens: number, price: Pricing): number {
  return (promptTokens * price.input + completionTokens * price.output) / 1_000_000;
}

export interface CostSummary {
  calls: CallCost[];
  totalUsd: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  byTier: Record<ModelTier, { calls: number; usd: number; tokens: number }>;
}

/** Collects the cost of every model call made during one committee run. */
export class CostTracker {
  readonly calls: CallCost[] = [];

  record(call: CallCost) {
    this.calls.push(call);
  }

  summary(): CostSummary {
    const byTier: CostSummary["byTier"] = {
      nano: { calls: 0, usd: 0, tokens: 0 },
      super: { calls: 0, usd: 0, tokens: 0 },
      ultra: { calls: 0, usd: 0, tokens: 0 },
    };
    let totalUsd = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    for (const c of this.calls) {
      totalUsd += c.estimatedCostUsd;
      totalPromptTokens += c.promptTokens;
      totalCompletionTokens += c.completionTokens;
      byTier[c.tier].calls += 1;
      byTier[c.tier].usd += c.estimatedCostUsd;
      byTier[c.tier].tokens += c.promptTokens + c.completionTokens;
    }
    return { calls: this.calls, totalUsd, totalPromptTokens, totalCompletionTokens, byTier };
  }
}
