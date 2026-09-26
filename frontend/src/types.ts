// Mirrors the backend response types (backend/src/orchestrator/types.ts). Kept as a small copy so the
// frontend build doesn't depend on backend source.

export type AnalystName = "fundamentals" | "technicals" | "risk";
export type Tier = "nano" | "super" | "ultra";

export interface AnalystReport {
  analyst: AnalystName;
  stance: "bullish" | "neutral" | "bearish";
  confidence: number;
  headline: string;
  keyPoints: string[];
  evidence: { metric: string; value: string; interpretation: string }[];
  concerns: string[];
}

export interface Rebuttal {
  analyst: AnalystName;
  respondingTo: AnalystName;
  response: string;
  stanceChanged: boolean;
}

export interface ChairDecision {
  recommendation: "BUY" | "HOLD" | "SELL";
  confidence: number;
  summary: string;
  rationale: string[];
  dissent: { analyst: AnalystName; argument: string } | null;
  keyRisks: string[];
  timeHorizon: string;
}

export interface NewsDigest {
  sentiment: "positive" | "mixed" | "negative" | "none";
  themes: string[];
  notableEvents: string[];
}

export interface CallCost {
  agent: string;
  model: string;
  tier: Tier;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
  attempt: number;
  ok: boolean;
}

export interface CostSummary {
  calls: CallCost[];
  totalUsd: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  byTier: Record<Tier, { calls: number; usd: number; tokens: number }>;
}

export interface AgentModel {
  id: string;
  label: string;
  tier: Tier;
  model: string | null;
  why: string;
}

export interface Snapshot {
  ticker: string;
  companyName: string;
  sector: string | null;
  industry: string | null;
  currency: string | null;
  asOf: string;
  lastClose: number;
  marketCap: number | null;
  technicals: { return1y: number | null; return1m: number | null; rsi14: number | null };
  risk: { volatility1y: number | null; betaVsSpy: number | null };
  facts: Record<AnalystName, Record<string, string>>;
  priceHistory: { date: string; close: number }[];
}

export interface SourceInfo {
  name: string;
  fetchedAt: string;
  stale: boolean;
}

export interface NewsItem {
  headline: string;
  source: string;
  datetime: string;
  url: string;
}

export interface CommitteeResult {
  ticker: string;
  generatedAt: string;
  snapshot: Snapshot;
  sources: SourceInfo[];
  news: NewsItem[];
  newsDigest: NewsDigest | null;
  reports: AnalystReport[];
  analystErrors: { analyst: AnalystName; message: string }[];
  rebuttals: Rebuttal[];
  decision: ChairDecision | null;
  chairError: string | null;
  memoMarkdown: string;
  costs: CostSummary;
  integrity: { agent: string; figures: string[] }[];
  agents: AgentModel[];
  replayed?: boolean;
}

export type Stage = "data" | "news" | "analysts" | "rebuttals" | "chair" | "memo";

export type CommitteeEvent =
  | { type: "stage"; stage: Stage; message: string }
  | { type: "snapshot"; snapshot: Snapshot; sources: SourceInfo[]; news: NewsItem[]; agents: AgentModel[] }
  | { type: "news"; digest: NewsDigest | null }
  | { type: "report"; report: AnalystReport }
  | { type: "analystError"; analyst: AnalystName; message: string }
  | { type: "rebuttal"; rebuttal: Rebuttal }
  | { type: "decision"; decision: ChairDecision }
  | { type: "done"; result: CommitteeResult }
  | { type: "error"; message: string; status: number };

export interface AppConfig {
  demoMode: boolean;
  demoTickers: string[];
  agents: AgentModel[];
}
