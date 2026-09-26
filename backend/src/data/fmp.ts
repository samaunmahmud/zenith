// Financial Modeling Prep "stable" API: daily prices and fundamentals.
import { config } from "../config.js";
import { DataError, type CompanyProfile, type PriceBar, type RawRecord } from "./types.js";

const BASE = "https://financialmodelingprep.com/stable";

async function get(endpoint: string, params: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams({ ...params, apikey: config.fmpKey() });
  const res = await fetch(`${BASE}/${endpoint}?${qs}`, { signal: AbortSignal.timeout(20_000) });
  const body = (await res.json().catch(() => null)) as unknown;
  // FMP reports errors as { "Error Message": "..." }, sometimes with a 200 status.
  if (body && typeof body === "object" && !Array.isArray(body) && "Error Message" in body) {
    throw new DataError(`FMP ${endpoint}: ${(body as RawRecord)["Error Message"]}`);
  }
  if (!res.ok) throw new DataError(`FMP ${endpoint}: HTTP ${res.status}`);
  return body;
}

function firstRecord(body: unknown): RawRecord {
  return Array.isArray(body) && body.length > 0 && typeof body[0] === "object" ? (body[0] as RawRecord) : {};
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function fetchPrices(ticker: string, days = 400): Promise<PriceBar[]> {
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const body = await get("historical-price-eod/full", { symbol: ticker, from });
  // Older API versions wrapped the rows in { historical: [...] }.
  const rows = (Array.isArray(body) ? body : ((body as RawRecord)?.historical ?? [])) as RawRecord[];
  const bars = rows
    .map((r) => ({
      date: String(r.date),
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close ?? r.adjClose),
      volume: Number(r.volume),
    }))
    .filter((b) => b.date && Number.isFinite(b.close))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (bars.length === 0) throw new DataError(`No price history found for ${ticker}. Is the ticker right?`, 404);
  return bars;
}

export async function fetchProfile(ticker: string): Promise<CompanyProfile> {
  const p = firstRecord(await get("profile", { symbol: ticker }));
  if (!p.symbol) throw new DataError(`Unknown ticker: ${ticker}`, 404);
  return {
    symbol: String(p.symbol),
    companyName: str(p.companyName) ?? ticker,
    sector: str(p.sector),
    industry: str(p.industry),
    description: str(p.description),
    currency: str(p.currency),
    exchange: str(p.exchange) ?? str(p.exchangeShortName),
    price: numOrNull(p.price),
    marketCap: numOrNull(p.marketCap) ?? numOrNull(p.mktCap),
  };
}

export async function fetchRatiosTtm(ticker: string): Promise<RawRecord> {
  return firstRecord(await get("ratios-ttm", { symbol: ticker }));
}

export async function fetchKeyMetricsTtm(ticker: string): Promise<RawRecord> {
  return firstRecord(await get("key-metrics-ttm", { symbol: ticker }));
}

export async function fetchGrowth(ticker: string): Promise<RawRecord> {
  return firstRecord(await get("financial-growth", { symbol: ticker, limit: "1" }));
}
