import { config } from "../config.js";
import { cached } from "./cache.js";
import { fetchNews } from "./finnhub.js";
import { fetchGrowth, fetchKeyMetricsTtm, fetchPrices, fetchProfile, fetchRatiosTtm } from "./fmp.js";
import type { MarketData, NewsItem } from "./types.js";

export const BENCHMARK = "SPY";

/** Fetch everything the committee needs for one ticker, cache-first. */
export async function getMarketData(ticker: string): Promise<MarketData> {
  // Profile first: it fails fast on a bad ticker before we spend the other calls.
  const profile = await cached(ticker, "profile", "FMP profile", () => fetchProfile(ticker));

  const [prices, benchmark, ratios, keyMetrics, growth, news] = await Promise.all([
    cached(ticker, "prices", "FMP daily prices", () => fetchPrices(ticker)),
    cached(BENCHMARK, "prices", "FMP daily prices (SPY)", () => fetchPrices(BENCHMARK)),
    cached(ticker, "ratios-ttm", "FMP ratios (TTM)", () => fetchRatiosTtm(ticker)).catch(() => null),
    cached(ticker, "key-metrics-ttm", "FMP key metrics (TTM)", () => fetchKeyMetricsTtm(ticker)).catch(() => null),
    cached(ticker, "growth", "FMP financial growth", () => fetchGrowth(ticker)).catch(() => null),
    getNews(ticker),
  ]);

  return {
    ticker,
    profile: profile.data,
    prices: prices.data,
    benchmark: benchmark.data,
    ratios: ratios?.data ?? {},
    keyMetrics: keyMetrics?.data ?? {},
    growth: growth?.data ?? {},
    news: news?.data ?? [],
    sources: [profile, prices, benchmark, ratios, keyMetrics, growth, news]
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .map((x) => x.source),
  };
}

// News is optional: a missing key or a failed fetch just means the committee runs without headlines.
async function getNews(ticker: string) {
  const key = config.finnhubKey();
  if (!key && !config.demoMode) return null;
  return cached<NewsItem[]>(ticker, "news", "Finnhub news", () => fetchNews(ticker, key!)).catch(() => null);
}
