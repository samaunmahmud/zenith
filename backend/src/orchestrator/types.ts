import type { ModelTier } from "../config.js";
import type { NewsItem, SourceInfo } from "../data/types.js";
import type { Snapshot } from "../indicators/snapshot.js";
import type { CostSummary } from "../llm/costs.js";
import type { AnalystName, AnalystReport, ChairDecision, NewsDigest, Rebuttal } from "../schemas/committee.js";

export interface AgentModel {
  id: string;
  label: string;
  tier: ModelTier;
  model: string;
  why: string;
}

export interface IntegrityFlag {
  agent: string;
  figures: string[]; // numbers in free text that couldn't be traced to the agent's input
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
  integrity: IntegrityFlag[];
  agents: AgentModel[];
  replayed?: boolean; // served from the last saved run (demo safety net)
}

export type CommitteeEvent =
  | { type: "stage"; stage: "data" | "news" | "analysts" | "rebuttals" | "chair" | "memo"; message: string }
  | { type: "snapshot"; snapshot: Snapshot; sources: SourceInfo[]; news: NewsItem[]; agents: AgentModel[] }
  | { type: "news"; digest: NewsDigest | null }
  | { type: "report"; report: AnalystReport }
  | { type: "analystError"; analyst: AnalystName; message: string }
  | { type: "rebuttal"; rebuttal: Rebuttal }
  | { type: "decision"; decision: ChairDecision }
  | { type: "done"; result: CommitteeResult }
  | { type: "error"; message: string; status: number };
