// Fundamentals: pick the metrics we care about out of raw FMP payloads.
// No maths is invented here: these are the provider's reported values, normalised.
import type { RawRecord } from "../data/types.js";

/** First finite number found under any of the given keys (FMP renamed fields between API versions). */
export function pickNumber(record: RawRecord, keys: string[]): number | null {
  for (const key of keys) {
    const v = record[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

export interface FundamentalMetrics {
  peRatio: number | null;
  pegRatio: number | null;
  priceToSales: number | null;
  priceToBook: number | null;
  evToEbitda: number | null;
  grossMargin: number | null; // fractions, e.g. 0.45 = 45%
  operatingMargin: number | null;
  netMargin: number | null;
  returnOnEquity: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  freeCashFlowYield: number | null;
  dividendYield: number | null;
  revenueGrowth: number | null; // latest fiscal year, YoY
  epsGrowth: number | null;
}

export function fundamentalMetrics(ratios: RawRecord, keyMetrics: RawRecord, growth: RawRecord): FundamentalMetrics {
  return {
    peRatio: pickNumber(ratios, ["priceToEarningsRatioTTM", "peRatioTTM"]) ?? pickNumber(keyMetrics, ["peRatioTTM"]),
    pegRatio: pickNumber(ratios, ["priceToEarningsGrowthRatioTTM", "pegRatioTTM"]),
    priceToSales: pickNumber(ratios, ["priceToSalesRatioTTM"]),
    priceToBook: pickNumber(ratios, ["priceToBookRatioTTM"]),
    evToEbitda: pickNumber(keyMetrics, ["evToEBITDATTM", "enterpriseValueOverEBITDATTM"]),
    grossMargin: pickNumber(ratios, ["grossProfitMarginTTM"]),
    operatingMargin: pickNumber(ratios, ["operatingProfitMarginTTM"]),
    netMargin: pickNumber(ratios, ["netProfitMarginTTM"]),
    returnOnEquity: pickNumber(keyMetrics, ["returnOnEquityTTM", "roeTTM"]) ?? pickNumber(ratios, ["returnOnEquityTTM"]),
    debtToEquity: pickNumber(ratios, ["debtToEquityRatioTTM", "debtEquityRatioTTM"]),
    currentRatio: pickNumber(ratios, ["currentRatioTTM"]) ?? pickNumber(keyMetrics, ["currentRatioTTM"]),
    freeCashFlowYield: pickNumber(keyMetrics, ["freeCashFlowYieldTTM"]),
    dividendYield: pickNumber(ratios, ["dividendYieldTTM"]),
    revenueGrowth: pickNumber(growth, ["revenueGrowth"]),
    epsGrowth: pickNumber(growth, ["epsgrowth", "epsGrowth"]),
  };
}
