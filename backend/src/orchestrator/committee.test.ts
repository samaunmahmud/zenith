// End-to-end test of the committee pipeline with a fake Token Factory and synthetic market data.
// Exercises: snapshot → news → parallel analysts → retry on invented number → chair → memo → costs.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { MarketData, PriceBar } from "../data/types.js";

process.env.TOKEN_FACTORY_API_KEY = "test";
process.env.TOKEN_FACTORY_BASE_URL = "http://fake";
process.env.NEMOTRON_NANO_MODEL = "fake-nano";
process.env.NEMOTRON_SUPER_MODEL = "fake-super";
process.env.NEMOTRON_ULTRA_MODEL = "fake-ultra";
process.env.CACHE_DIR = mkdtempSync(path.join(tmpdir(), "zenith-test-"));

function bars(n: number, start: number, drift: number): PriceBar[] {
  const out: PriceBar[] = [];
  let close = start;
  for (let i = 0; i < n; i++) {
    close *= 1 + drift + Math.sin(i / 3) * 0.01;
    const date = new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
    out.push({ date, open: close, high: close * 1.01, low: close * 0.99, close, volume: 1_000_000 });
  }
  return out;
}

const market: MarketData = {
  ticker: "TEST",
  profile: {
    symbol: "TEST",
    companyName: "Test Corp",
    sector: "Technology",
    industry: "Software",
    description: null,
    currency: "USD",
    exchange: "NASDAQ",
    price: null,
    marketCap: 2.5e12,
  },
  prices: bars(300, 100, 0.001),
  benchmark: bars(300, 400, 0.0005),
  ratios: { priceToEarningsRatioTTM: 31.42, grossProfitMarginTTM: 0.462 },
  keyMetrics: {},
  growth: { revenueGrowth: 0.08 },
  news: [{ headline: "Test Corp launches product", source: "Wire", datetime: "2026-09-20T00:00:00Z", url: "", summary: "" }],
  sources: [{ name: "fake", fetchedAt: "2026-09-26T00:00:00Z", stale: false }],
};

vi.mock("../data/marketData.js", () => ({ getMarketData: vi.fn(async () => market) }));

const calls: { model: string; system: string }[] = [];
let technicalsAttempts = 0;

// Fake Nemotron: answers based on which agent's system prompt it receives.
vi.mock("openai", () => {
  class APIError extends Error {
    status = 500;
  }
  class OpenAI {
    static APIError = APIError;
    chat = {
      completions: {
        create: async ({ model, messages }: { model: string; messages: { role: string; content: string }[] }) => {
          const system = messages[0].content;
          const user = messages[1].content;
          calls.push({ model, system });
          const lastClose = user.match(/Last close: (\S+)/)?.[1] ?? "$1.00";
          let body: unknown;

          if (system.startsWith("You are a news desk")) {
            body = { sentiment: "positive", themes: ["Product launch"], notableEvents: ["New product"] };
          } else if (system.includes("Chair of an investment committee")) {
            body = {
              recommendation: "HOLD",
              confidence: 0.6,
              summary: "Balanced case.",
              rationale: ["[Fundamentals] margins are strong", "[Technicals] trend is up", "[Risk] volatility is manageable"],
              dissent: { analyst: "fundamentals", argument: "Valuation at a P/E of 31.42 is rich." },
              keyRisks: ["Valuation", "Momentum fading"],
              timeHorizon: "3-6 months",
            };
          } else if (system.includes("rebuttal")) {
            const me = system.match(/You are the (\w+) analyst/)![1];
            body = { analyst: me, respondingTo: me === "risk" ? "technicals" : "risk", response: "I disagree.", stanceChanged: false };
          } else {
            const analyst = system.match(/Your analyst id is "(\w+)"/)![1];
            let value = lastClose;
            // Technicals invents a number on the first attempt; the validator must catch it and retry.
            if (analyst === "technicals" && technicalsAttempts++ === 0) value = "$999.99";
            body = {
              analyst,
              stance: "bullish",
              confidence: 0.7,
              headline: `${analyst} thesis`,
              keyPoints: ["Point one", "Point two"],
              evidence: [{ metric: "Last close", value, interpretation: "Price level" }],
              concerns: [],
            };
          }
          return {
            choices: [{ message: { content: JSON.stringify(body) } }],
            usage: { prompt_tokens: 1000, completion_tokens: 200 },
          };
        },
      },
    };
  }
  return { default: OpenAI };
});

describe("runCommittee (end to end, fake models)", () => {
  let result: Awaited<ReturnType<typeof import("./committee.js")["runCommittee"]>>;
  const events: string[] = [];

  beforeAll(async () => {
    const { runCommittee } = await import("./committee.js");
    result = await runCommittee("TEST", { rebuttals: true }, (e) => events.push(e.type));
  });

  it("produces three validated reports, rebuttals and a decision", () => {
    expect(result.reports.map((r) => r.analyst)).toEqual(["fundamentals", "technicals", "risk"]);
    expect(result.analystErrors).toEqual([]);
    expect(result.rebuttals).toHaveLength(3);
    expect(result.decision?.recommendation).toBe("HOLD");
    expect(result.decision?.dissent?.analyst).toBe("fundamentals");
  });

  it("routes each agent to the right Nemotron tier", () => {
    const modelFor = (needle: string) => calls.find((c) => c.system.includes(needle))?.model;
    expect(modelFor("news desk")).toBe("fake-nano");
    expect(modelFor('analyst id is "technicals"')).toBe("fake-nano");
    expect(modelFor('analyst id is "fundamentals"')).toBe("fake-super");
    expect(modelFor('analyst id is "risk"')).toBe("fake-super");
    expect(modelFor("Chair of an investment committee")).toBe("fake-ultra");
  });

  it("retries an analyst that invented a number, and records both attempts in the costs", () => {
    const tech = result.costs.calls.filter((c) => c.agent === "technicals");
    expect(tech.map((c) => [c.attempt, c.ok])).toEqual([
      [1, false],
      [2, true],
    ]);
    expect(result.reports.find((r) => r.analyst === "technicals")!.evidence[0].value).not.toBe("$999.99");
  });

  it("totals the committee cost by model tier", () => {
    // 1 news + 4 analyst calls (one retry) + 3 rebuttals + 1 chair = 9 calls
    expect(result.costs.calls).toHaveLength(9);
    expect(result.costs.byTier.ultra.calls).toBe(1);
    // Ultra: 1000 in × $1/M + 200 out × $3/M = $0.0016
    expect(result.costs.byTier.ultra.usd).toBeCloseTo(0.0016, 6);
  });

  it("builds a memo with the decision, dissent, cost table and disclaimer", () => {
    expect(result.memoMarkdown).toContain("## Decision: HOLD");
    expect(result.memoMarkdown).toContain("Fundamentals analyst:** Valuation at a P/E of 31.42 is rich.");
    expect(result.memoMarkdown).toContain("## Committee cost");
    expect(result.memoMarkdown).toContain("not financial advice");
  });

  it("finds no untraceable figures when agents only quote their input", () => {
    expect(result.integrity).toEqual([]);
  });

  it("streams progress events in order", () => {
    expect(events[0]).toBe("stage");
    expect(events).toContain("snapshot");
    expect(events.filter((e) => e === "report")).toHaveLength(3);
    expect(events.indexOf("decision")).toBeGreaterThan(events.lastIndexOf("report"));
  });
});
