import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// Repo root is two levels up from backend/src (and from backend/dist).
export const REPO_ROOT = path.resolve(here, "..", "..");

// Load the root .env regardless of which workspace we were started from.
loadEnv({ path: path.join(REPO_ROOT, ".env") });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined || raw === "" ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export type ModelTier = "nano" | "super" | "ultra";

export const config = {
  port: num("PORT", 3001),
  cacheDir: process.env.CACHE_DIR ?? path.join(REPO_ROOT, "cache"),
  // In demo mode the data layer never touches the network: cached data only.
  demoMode: process.env.DEMO_MODE === "true",
  cacheTtlHours: num("CACHE_TTL_HOURS", 12),
  demoTickers: (process.env.DEMO_TICKERS ?? "AAPL,NVDA,JPM,TSLA")
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean),

  // Read lazily so the server can start (e.g. /api/health) before keys are set up.
  tokenFactory: () => ({
    apiKey: required("TOKEN_FACTORY_API_KEY"),
    baseURL: required("TOKEN_FACTORY_BASE_URL"),
    models: {
      nano: required("NEMOTRON_NANO_MODEL"),
      super: required("NEMOTRON_SUPER_MODEL"),
      ultra: required("NEMOTRON_ULTRA_MODEL"),
    } satisfies Record<ModelTier, string>,
  }),

  // USD per 1M tokens. Defaults are the Token Factory list prices (Sept 2026);
  // override in .env if they change.
  pricing: (): Record<ModelTier, { input: number; output: number }> => ({
    nano: { input: num("PRICE_NANO_INPUT", 0.06), output: num("PRICE_NANO_OUTPUT", 0.24) },
    super: { input: num("PRICE_SUPER_INPUT", 0.3), output: num("PRICE_SUPER_OUTPUT", 0.9) },
    ultra: { input: num("PRICE_ULTRA_INPUT", 1.0), output: num("PRICE_ULTRA_OUTPUT", 3.0) },
  }),

  fmpKey: () => required("FMP_API_KEY"),
  finnhubKey: () => process.env.FINNHUB_API_KEY || null, // optional: news is a nice-to-have
};
