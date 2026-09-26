import { z } from "zod";

export const AnalystName = z.enum(["fundamentals", "technicals", "risk"]);

export const AnalystReport = z.object({
  analyst: AnalystName,
  stance: z.enum(["bullish", "neutral", "bearish"]),
  confidence: z.number().min(0).max(1),
  headline: z.string(),
  keyPoints: z.array(z.string()).min(2).max(5),
  evidence: z.array(
    z.object({
      metric: z.string(),
      value: z.string(),
      interpretation: z.string(),
    })
  ),
  concerns: z.array(z.string()).max(3),
});

export const Rebuttal = z.object({
  analyst: AnalystName,
  respondingTo: AnalystName,
  response: z.string(),
  stanceChanged: z.boolean(),
});

export const ChairDecision = z.object({
  recommendation: z.enum(["BUY", "HOLD", "SELL"]),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  rationale: z.array(z.string()).min(3).max(5),
  dissent: z.object({ analyst: AnalystName, argument: z.string() }).nullable(),
  keyRisks: z.array(z.string()).min(2).max(4),
  timeHorizon: z.string(),
});

export const CallCost = z.object({
  agent: z.string(),
  model: z.string(),
  promptTokens: z.number(),
  completionTokens: z.number(),
  latencyMs: z.number(),
  estimatedCostUsd: z.number(),
});

export type AnalystReport = z.infer<typeof AnalystReport>;
export type Rebuttal = z.infer<typeof Rebuttal>;
export type ChairDecision = z.infer<typeof ChairDecision>;
export type CallCost = z.infer<typeof CallCost>;
