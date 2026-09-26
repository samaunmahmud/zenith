export interface PriceBar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CompanyProfile {
  symbol: string;
  companyName: string;
  sector: string | null;
  industry: string | null;
  description: string | null;
  currency: string | null;
  exchange: string | null;
  price: number | null;
  marketCap: number | null;
}

/** Raw FMP payloads. Field names vary between API versions, so mapping is done defensively later. */
export type RawRecord = Record<string, unknown>;

export interface NewsItem {
  headline: string;
  source: string;
  datetime: string; // ISO
  url: string;
  summary: string;
}

export interface SourceInfo {
  name: string;
  fetchedAt: string;
  stale: boolean; // true if served from an expired cache because the live fetch failed
}

export interface MarketData {
  ticker: string;
  profile: CompanyProfile;
  prices: PriceBar[]; // oldest → newest
  benchmark: PriceBar[]; // SPY, oldest → newest
  ratios: RawRecord;
  keyMetrics: RawRecord;
  growth: RawRecord;
  news: NewsItem[];
  sources: SourceInfo[];
}

export class DataError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
    this.name = "DataError";
  }
}
