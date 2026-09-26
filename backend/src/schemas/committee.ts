import { z } from "zod";

export const AnalystName = z.enum(["fundamentals", "technicals", "risk"]);

export const Evidence = z.object({
  metric: z.string().min(1),
  value: z.string().min(1).describe("Copied exactly from the input data"),
  interpretation: z.string().min(1),
});

export const AnalystReport = z.object({
  analyst: AnalystName,
  stance: z.enum(["bullish", "neutral", "bearish"]),
  confidence: z.number().min(0).max(1),
  headline: z.string().min(1).describe("One-sentence thesis"),
  keyPoints: z.array(z.string()).min(2).max(5),
  evidence: z.array(Evidence).min(1).max(8),
  concerns: z.array(z.string()).max(3).describe("What could make this analyst wrong"),
});

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export const Rebuttal = z
  .object({
    analyst: AnalystName,
    respondingTo: AnalystName,
    response: z
      .string()
      .min(1)
      .refine((s) => wordCount(s) <= 80, { message: "response must be 80 words or fewer" }),
    stanceChanged: z.boolean(),
  })
  .refine((r) => r.analyst !== r.respondingTo, {
    message: "an analyst cannot respond to itself",
    path: ["respondingTo"],
  });

export const ChairDecision = z.object({
  recommendation: z.enum(["BUY", "HOLD", "SELL"]),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1).describe("2-3 sentences"),
  rationale: z
    .array(z.string())
    .min(3)
    .max(5)
    .describe("Each point names the analyst whose argument it draws on"),
  dissent: z
    .object({ analyst: AnalystName, argument: z.string().min(1) })
    .nullable()
    .describe("Strongest argument against the decision"),
  keyRisks: z.array(z.string()).min(2).max(4),
  timeHorizon: z.string().min(1),
});

export const NewsDigest = z.object({
  sentiment: z.enum(["positive", "mixed", "negative", "none"]),
  themes: z.array(z.string()).max(4),
  notableEvents: z.array(z.string()).max(4),
});

export const CallCost = z.object({
  agent: z.string(),
  model: z.string(),
  tier: z.enum(["nano", "super", "ultra"]),
  promptTokens: z.number(),
  completionTokens: z.number(),
  latencyMs: z.number(),
  estimatedCostUsd: z.number(),
  attempt: z.number(),
  ok: z.boolean(),
});

export type AnalystName = z.infer<typeof AnalystName>;
export type AnalystReport = z.infer<typeof AnalystReport>;
export type Rebuttal = z.infer<typeof Rebuttal>;
export type ChairDecision = z.infer<typeof ChairDecision>;
export type NewsDigest = z.infer<typeof NewsDigest>;
export type CallCost = z.infer<typeof CallCost>;
