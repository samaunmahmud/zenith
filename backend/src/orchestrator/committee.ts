import { analystInput, runAnalyst } from "../agents/analysts.js";
import { chairInput, runChair } from "../agents/chair.js";
import { summariseNews } from "../agents/news.js";
import { allowedNumbers, unsupportedNumbers } from "../agents/numberCheck.js";
import { runRebuttal } from "../agents/rebuttal.js";
import { ANALYST_ORDER, ANALYSTS, CHAIR, NEWS_DESK } from "../agents/roster.js";
import { readCache, writeCache } from "../data/cache.js";
import { getMarketData } from "../data/marketData.js";
import { buildSnapshot, type Snapshot } from "../indicators/snapshot.js";
import { LlmError, modelFor } from "../llm/client.js";
import { CostTracker } from "../llm/costs.js";
import { buildMemo } from "../memo/memo.js";
import type { AnalystReport, ChairDecision, NewsDigest, Rebuttal } from "../schemas/committee.js";
import type { AgentModel, CommitteeEvent, CommitteeResult, IntegrityFlag } from "./types.js";

export interface CommitteeOptions {
  rebuttals?: boolean;
}

type Emit = (event: CommitteeEvent) => void;

const errorMessage = (err: unknown) =>
  err instanceof LlmError
    ? `${err.message}${err.issues.length ? `: ${err.issues.slice(0, 3).join("; ")}` : ""}`
    : (err as Error)?.message ?? String(err);

export function agentRoster(): AgentModel[] {
  return [NEWS_DESK, ...ANALYST_ORDER.map((a) => ANALYSTS[a]), CHAIR].map((a) => ({ ...a, model: modelFor(a.tier) }));
}

/**
 * Runs one committee meeting. Emits progress events as each stage finishes (used for SSE),
 * and returns the complete result. Analyst failures are isolated: the chair still decides
 * on the reports that did arrive, and says which are missing.
 */
export async function runCommittee(ticker: string, options: CommitteeOptions = {}, emit: Emit = () => {}): Promise<CommitteeResult> {
  const tracker = new CostTracker();
  const agents = agentRoster();

  // 1–2. Data + indicators (deterministic, no LLM)
  emit({ type: "stage", stage: "data", message: `Fetching market data for ${ticker}` });
  const market = await getMarketData(ticker);
  const snapshot = buildSnapshot(market);
  emit({ type: "snapshot", snapshot, sources: market.sources, news: market.news, agents });

  // News digest (Nano). Optional: failure just means analysts see "no news".
  emit({ type: "stage", stage: "news", message: "News desk is summarising headlines" });
  let newsDigest: NewsDigest | null = null;
  try {
    newsDigest = await summariseNews(ticker, market.news, tracker);
  } catch (err) {
    console.warn(`[committee] news digest failed: ${errorMessage(err)}`);
  }
  emit({ type: "news", digest: newsDigest });

  // 3. Analyst round, in parallel
  emit({ type: "stage", stage: "analysts", message: "Analysts are preparing their reports" });
  const reports: AnalystReport[] = [];
  const analystErrors: CommitteeResult["analystErrors"] = [];
  await Promise.all(
    ANALYST_ORDER.map(async (analyst) => {
      try {
        const report = await runAnalyst(analyst, snapshot, newsDigest, tracker);
        reports.push(report);
        emit({ type: "report", report });
      } catch (err) {
        const message = errorMessage(err);
        analystErrors.push({ analyst, message });
        emit({ type: "analystError", analyst, message });
      }
    })
  );
  reports.sort((a, b) => ANALYST_ORDER.indexOf(a.analyst) - ANALYST_ORDER.indexOf(b.analyst));
  if (reports.length === 0) {
    throw new LlmError(`All analysts failed. First error: ${analystErrors[0]?.message ?? "unknown"}`, "committee");
  }

  // 4. Optional rebuttal round: exactly one round, in parallel, needs at least two reports
  const rebuttals: Rebuttal[] = [];
  if (options.rebuttals && reports.length >= 2) {
    emit({ type: "stage", stage: "rebuttals", message: "Analysts are responding to each other" });
    await Promise.all(
      reports.map(async (r) => {
        try {
          const rebuttal = await runRebuttal(r.analyst, ticker, reports, tracker);
          rebuttals.push(rebuttal);
          emit({ type: "rebuttal", rebuttal });
        } catch (err) {
          console.warn(`[committee] ${r.analyst} rebuttal failed: ${errorMessage(err)}`);
        }
      })
    );
    rebuttals.sort((a, b) => ANALYST_ORDER.indexOf(a.analyst) - ANALYST_ORDER.indexOf(b.analyst));
  }

  // 5. Chair (Ultra)
  emit({ type: "stage", stage: "chair", message: "The chair is weighing the arguments" });
  let decision: ChairDecision | null = null;
  let chairError: string | null = null;
  try {
    decision = await runChair(snapshot, reports, rebuttals, tracker);
    emit({ type: "decision", decision });
  } catch (err) {
    chairError = errorMessage(err);
  }

  // 6. Memo (code-assembled)
  emit({ type: "stage", stage: "memo", message: "Writing the memo" });
  const partial: Omit<CommitteeResult, "memoMarkdown"> = {
    ticker,
    generatedAt: new Date().toISOString(),
    snapshot,
    sources: market.sources,
    news: market.news,
    newsDigest,
    reports,
    analystErrors,
    rebuttals,
    decision,
    chairError,
    costs: tracker.summary(),
    integrity: integrityFlags(snapshot, newsDigest, reports, rebuttals, decision),
    agents,
  };
  const result: CommitteeResult = { ...partial, memoMarkdown: buildMemo(partial) };

  // Keep the last complete run per ticker: the demo safety net if Token Factory is unreachable on stage.
  if (decision) await writeCache(ticker, "last-committee", result).catch(() => {});
  return result;
}

export async function lastSavedRun(ticker: string): Promise<CommitteeResult | null> {
  const hit = await readCache<CommitteeResult>(ticker, "last-committee");
  return hit ? { ...hit.data, replayed: true } : null;
}

/**
 * Soft integrity check on free text (headlines, key points, rationale...). Evidence values are
 * already hard-checked with a retry; here we only report figures we couldn't trace.
 */
function integrityFlags(
  snapshot: Snapshot,
  news: NewsDigest | null,
  reports: AnalystReport[],
  rebuttals: Rebuttal[],
  decision: ChairDecision | null
): IntegrityFlag[] {
  const flags: IntegrityFlag[] = [];
  const check = (agent: string, allowedFrom: string[], texts: string[]) => {
    const allowed = allowedNumbers(allowedFrom);
    const figures = [...new Set(texts.flatMap((t) => unsupportedNumbers(t, allowed)))];
    if (figures.length) flags.push({ agent, figures });
  };

  for (const r of reports) {
    check(r.analyst, [analystInput(r.analyst, snapshot, news)], [
      r.headline,
      ...r.keyPoints,
      ...r.evidence.map((e) => e.interpretation),
      ...r.concerns,
    ]);
  }
  // Rebuttals and the chair may quote any analyst's figures.
  const everything = [
    ...ANALYST_ORDER.map((a) => analystInput(a, snapshot, news)),
    chairInput(snapshot, reports, rebuttals),
  ];
  for (const r of rebuttals) check(`${r.analyst}-rebuttal`, everything, [r.response]);
  if (decision) {
    check("chair", everything, [
      decision.summary,
      ...decision.rationale,
      ...decision.keyRisks,
      decision.dissent?.argument ?? "",
    ]);
  }
  return flags;
}
