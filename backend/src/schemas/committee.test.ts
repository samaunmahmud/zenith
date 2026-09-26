import { describe, expect, it } from "vitest";
import { extractJson } from "../llm/client.js";
import { AnalystReport, ChairDecision, Rebuttal } from "./committee.js";

const validReport = {
  analyst: "fundamentals",
  stance: "bullish",
  confidence: 0.7,
  headline: "Strong margins justify the premium.",
  keyPoints: ["High margins", "Low leverage"],
  evidence: [{ metric: "Gross margin (TTM)", value: "46.2%", interpretation: "Best in class" }],
  concerns: [],
};

describe("AnalystReport", () => {
  it("accepts a valid report", () => {
    expect(AnalystReport.safeParse(validReport).success).toBe(true);
  });
  it("rejects out-of-range confidence, too few key points and missing evidence", () => {
    expect(AnalystReport.safeParse({ ...validReport, confidence: 1.2 }).success).toBe(false);
    expect(AnalystReport.safeParse({ ...validReport, keyPoints: ["one"] }).success).toBe(false);
    expect(AnalystReport.safeParse({ ...validReport, evidence: [] }).success).toBe(false);
    expect(AnalystReport.safeParse({ ...validReport, concerns: ["a", "b", "c", "d"] }).success).toBe(false);
  });
});

describe("Rebuttal", () => {
  const base = { analyst: "risk", respondingTo: "technicals", stanceChanged: false };
  it("enforces the 80-word limit", () => {
    expect(Rebuttal.safeParse({ ...base, response: "word ".repeat(80) }).success).toBe(true);
    expect(Rebuttal.safeParse({ ...base, response: "word ".repeat(81) }).success).toBe(false);
  });
  it("rejects responding to yourself", () => {
    expect(Rebuttal.safeParse({ ...base, respondingTo: "risk", response: "hi" }).success).toBe(false);
  });
});

describe("ChairDecision", () => {
  const decision = {
    recommendation: "HOLD",
    confidence: 0.55,
    summary: "Mixed picture.",
    rationale: ["a (fundamentals)", "b (technicals)", "c (risk)"],
    dissent: { analyst: "fundamentals", argument: "Valuation is fine." },
    keyRisks: ["x", "y"],
    timeHorizon: "3-6 months",
  };
  it("accepts a valid decision, including a null dissent", () => {
    expect(ChairDecision.safeParse(decision).success).toBe(true);
    expect(ChairDecision.safeParse({ ...decision, dissent: null }).success).toBe(true);
  });
  it("rejects unknown recommendations", () => {
    expect(ChairDecision.safeParse({ ...decision, recommendation: "STRONG BUY" }).success).toBe(false);
  });
});

describe("extractJson", () => {
  it("handles think blocks and markdown fences from reasoning models", () => {
    expect(extractJson('<think>hmm {"no": 1}</think>\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! {"a": {"b": 2}} Hope that helps')).toEqual({ a: { b: 2 } });
  });
  it("throws when there is no JSON", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});
