// Finnhub: recent company news headlines (free tier).
import { DataError, type NewsItem } from "./types.js";

export async function fetchNews(ticker: string, apiKey: string, days = 14, max = 12): Promise<NewsItem[]> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const qs = new URLSearchParams({
    symbol: ticker,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    token: apiKey,
  });
  const res = await fetch(`https://finnhub.io/api/v1/company-news?${qs}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new DataError(`Finnhub company-news: HTTP ${res.status}`);
  const rows = (await res.json()) as Array<Record<string, unknown>>;
  if (!Array.isArray(rows)) return [];

  const seen = new Set<string>();
  return rows
    .filter((r) => typeof r.headline === "string" && r.headline)
    .sort((a, b) => Number(b.datetime) - Number(a.datetime))
    .filter((r) => {
      const key = String(r.headline).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, max)
    .map((r) => ({
      headline: String(r.headline),
      source: String(r.source ?? ""),
      datetime: new Date(Number(r.datetime) * 1000).toISOString(),
      url: String(r.url ?? ""),
      summary: String(r.summary ?? "").slice(0, 300),
    }));
}
