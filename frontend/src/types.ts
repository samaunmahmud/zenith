// Mirrors the backend response records (backend/src/main/java/com/zenith). Kept as a small copy so the
// frontend build doesn't depend on backend source.

export type AnalystName = "fundamentals" | "technicals" | "risk";
export type Tier = "nano" | "super" | "ultra";
export type Stance = "bullish" | "neutral" | "bearish";

export interface AnalystReport {
  analyst: AnalystName;
  stance: Stance;
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
  /** Same calls priced at Ultra's list price. Missing in runs saved before this was added. */
  allUltraUsd?: number | null;
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
  technicals: { return1y: number | null; return1m: number | null; rsi14: number | null; range52w?: { high: number; low: number } | null };
  risk: { volatility1y: number | null; betaVsSpy: number | null };
  facts: Record<AnalystName, Record<string, string>>;
  priceHistory: { date: string; close: number; sma50: number | null; sma200: number | null }[];
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
  /** Why a saved decision was served: reused while recent, committee busy, or the live run failed. */
  replayReason?: "recent" | "busy" | "fallback" | null;
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

/** GET /api/search: a US-listed stock matching a ticker or company name. */
export interface SymbolMatch {
  symbol: string;
  name: string;
  exchange: string;
}

/** GET /api/tape: one stock on file, from the cache (never live). `change` is a fraction of the previous close. */
export interface TapeRow {
  ticker: string;
  company: string;
  asOf: string;
  close: number;
  change: number | null;
  spark: number[];
  lastCall: { call: "BUY" | "HOLD" | "SELL"; confidence: number; decidedAt: string } | null;
}

/** GET /api/health: whether live AI runs are possible right now. */
export interface Health {
  status: string;
  demoMode: boolean;
  budget: { maxUsd: number; spentUsd: number };
  keys: { tokenFactory: boolean; fmp: boolean; finnhub: boolean };
}

export interface TrackedCall {
  id: string;
  ticker: string;
  company: string;
  decidedAt: string;
  asOf: string;
  call: "BUY" | "HOLD" | "SELL";
  confidence: number;
  timeHorizon: string;
  entryClose: number;
}

export interface TrackOutcome {
  days: number;
  status: "pending" | "scored";
  dueDate: string;
  exitDate: string | null;
  stockReturn: number | null;
  spyReturn: number | null;
  excess: number | null;
  correct: boolean | null;
}

export interface HorizonSummary {
  days: number;
  scored: number;
  correct: number;
  pending: number;
  winRate: number | null;
  avgEdge: number | null;
}

export interface TrackRecord {
  generatedAt: string;
  benchmark: string;
  holdBandPct: number;
  summary: HorizonSummary[];
  calls: { call: TrackedCall; outcomes: TrackOutcome[] }[];
  unavailable: string[];
}

export type ThesisVerdict = "supported" | "partly_supported" | "contradicted" | "untestable";

export interface ThesisResult {
  ticker: string;
  generatedAt: string;
  sessionAt: string;
  call: "BUY" | "HOLD" | "SELL";
  thesis: string;
  review: {
    verdict: ThesisVerdict;
    summary: string;
    claims: { claim: string; assessment: "supported" | "contradicted" | "unverifiable"; evidence: string; analyst: AnalystName | null }[];
    counterThesis: string;
    blindSpots: string[];
    whatWouldChangeIt: string[];
  };
  untraced: string[];
  costs: CostSummary;
  memoMarkdown: string;
}

/** POST /api/ask: the committee secretary's answer to a follow-up question about the latest session. */
export interface AskResult {
  ticker: string;
  sessionAt: string;
  question: string;
  answer: {
    answer: string;
    basis: { metric: string; value: string; interpretation: string }[];
    followUps: string[];
  };
  untraced: string[];
  costs: CostSummary;
}

/** One earlier exchange, sent back with the next question so the server can stay stateless. */
export interface AskTurn {
  question: string;
  answer: string;
}
