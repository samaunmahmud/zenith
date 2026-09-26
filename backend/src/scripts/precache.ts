// Pre-cache the demo tickers so a live demo never depends on rate-limited APIs.
//   npm run precache                → market data only (FMP + Finnhub)
//   npm run precache -- --committee → also run the full committee once per ticker and save it
//                                     as the replay fallback (costs a few cents of Token Factory credit)
import { config } from "../config.js";
import { getMarketData } from "../data/marketData.js";
import { runCommittee } from "../orchestrator/committee.js";

const withCommittee = process.argv.includes("--committee");
const tickers = process.argv.slice(2).filter((a) => !a.startsWith("--")).map((t) => t.toUpperCase());
const list = tickers.length ? tickers : config.demoTickers;

console.log(`Pre-caching ${list.join(", ")}${withCommittee ? " (with committee runs)" : ""}\n`);

for (const ticker of list) {
  try {
    const md = await getMarketData(ticker);
    console.log(`✓ ${ticker}: ${md.prices.length} price bars, ${md.news.length} headlines`);
    if (withCommittee) {
      const r = await runCommittee(ticker, { rebuttals: true });
      console.log(
        `  committee: ${r.decision?.recommendation ?? "no decision"}, ${r.reports.length}/3 reports, ` +
          `$${r.costs.totalUsd.toFixed(4)}, ${r.integrity.length} integrity flag(s)`
      );
    }
  } catch (err) {
    console.log(`✗ ${ticker}: ${(err as Error).message}`);
  }
}
