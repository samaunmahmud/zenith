import type { NewsItem } from "../data/types.js";
import { callStructured } from "../llm/client.js";
import type { CostTracker } from "../llm/costs.js";
import { NewsDigest } from "../schemas/committee.js";
import { NEWS_SYSTEM } from "./prompts/news.js";
import { NEWS_DESK } from "./roster.js";

/** Nano condenses raw headlines into a short digest the analysts can use. */
export async function summariseNews(
  ticker: string,
  news: NewsItem[],
  tracker: CostTracker
): Promise<NewsDigest | null> {
  if (news.length === 0) return null;
  const headlines = news.map((n) => `- [${n.datetime.slice(0, 10)}] ${n.headline} (${n.source})`).join("\n");
  return callStructured({
    agent: NEWS_DESK.id,
    tier: NEWS_DESK.tier,
    system: NEWS_SYSTEM,
    user: `Company: ${ticker}\nHeadlines from the last two weeks:\n${headlines}`,
    schema: NewsDigest,
    schemaName: "NewsDigest",
    temperature: 0.2,
    tracker,
  });
}
