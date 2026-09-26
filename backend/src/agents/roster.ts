import type { ModelTier } from "../config.js";
import type { AnalystName } from "../schemas/committee.js";

// Which Nemotron model does what, and why. This is the Nano / Super / Ultra split the product shows off.
export interface AgentInfo {
  id: string;
  label: string;
  tier: ModelTier;
  why: string;
}

export const ANALYSTS: Record<AnalystName, AgentInfo> = {
  fundamentals: {
    id: "fundamentals",
    label: "Fundamentals Analyst",
    tier: "super",
    why: "Weighing valuation against growth, margins and leverage needs mid-weight reasoning.",
  },
  technicals: {
    id: "technicals",
    label: "Technicals Analyst",
    tier: "nano",
    why: "Reading well-defined indicators (RSI, MACD, moving averages) is a narrow task, so the fast, cheap model is enough.",
  },
  risk: {
    id: "risk",
    label: "Risk Analyst",
    tier: "super",
    why: "Combining volatility, drawdown, beta, leverage and news risk into one view needs more reasoning.",
  },
};

export const CHAIR: AgentInfo = {
  id: "chair",
  label: "Committee Chair",
  tier: "ultra",
  why: "The final judgement weighs conflicting arguments and records the dissent, so it gets the strongest reasoning model.",
};

export const NEWS_DESK: AgentInfo = {
  id: "news",
  label: "News Desk",
  tier: "nano",
  why: "Summarising headlines into themes is simple, high-volume work, a textbook Nano job.",
};

export const ANALYST_ORDER: AnalystName[] = ["fundamentals", "technicals", "risk"];
