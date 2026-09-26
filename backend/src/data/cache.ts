import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { DataError, type SourceInfo } from "./types.js";

interface CacheEntry<T> {
  fetchedAt: string;
  data: T;
}

function fileFor(ticker: string, name: string): string {
  const safeTicker = ticker.replace(/[^A-Z0-9.\-]/gi, "_").toUpperCase();
  return path.join(config.cacheDir, safeTicker, `${name}.json`);
}

export async function readCache<T>(ticker: string, name: string): Promise<CacheEntry<T> | null> {
  try {
    return JSON.parse(await readFile(fileFor(ticker, name), "utf8")) as CacheEntry<T>;
  } catch {
    return null;
  }
}

export async function writeCache<T>(ticker: string, name: string, data: T): Promise<CacheEntry<T>> {
  const entry: CacheEntry<T> = { fetchedAt: new Date().toISOString(), data };
  const file = fileFor(ticker, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(entry, null, 2));
  return entry;
}

/**
 * Cache-first fetch. Order of preference:
 *   1. fresh cache  2. live fetch (then cached)  3. stale cache if the live fetch fails.
 * In demo mode, only the cache is used, so a demo never depends on a rate-limited API.
 */
export async function cached<T>(
  ticker: string,
  name: string,
  label: string,
  fetcher: () => Promise<T>
): Promise<{ data: T; source: SourceInfo }> {
  const hit = await readCache<T>(ticker, name);
  const ageHours = hit ? (Date.now() - Date.parse(hit.fetchedAt)) / 3_600_000 : Infinity;

  if (hit && (config.demoMode || ageHours < config.cacheTtlHours)) {
    return { data: hit.data, source: { name: label, fetchedAt: hit.fetchedAt, stale: false } };
  }
  if (config.demoMode) {
    throw new DataError(`Demo mode: no cached ${label} for ${ticker}. Try one of: ${config.demoTickers.join(", ")}`, 404);
  }

  try {
    const entry = await writeCache(ticker, name, await fetcher());
    return { data: entry.data, source: { name: label, fetchedAt: entry.fetchedAt, stale: false } };
  } catch (err) {
    if (hit) {
      console.warn(`[cache] ${label} fetch failed for ${ticker}, serving stale cache: ${(err as Error).message}`);
      return { data: hit.data, source: { name: label, fetchedAt: hit.fetchedAt, stale: true } };
    }
    throw err;
  }
}
