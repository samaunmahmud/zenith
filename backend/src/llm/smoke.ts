// Smoke test: call Nano, Super and Ultra once each and print token usage, latency and cost.
// Run with: npm run smoke
import { config, type ModelTier } from "../config.js";
import { chat } from "./client.js";
import { CostTracker } from "./costs.js";

const tracker = new CostTracker();
const tiers: ModelTier[] = ["nano", "super", "ultra"];

for (const tier of tiers) {
  const model = config.tokenFactory().models[tier];
  process.stdout.write(`${tier.padEnd(5)} ${model} ... `);
  try {
    const { text: reply, cost: c } = await chat({
      agent: `smoke-${tier}`,
      tier,
      tracker,
      maxTokens: 1024,
      messages: [{ role: "user", content: "In one sentence: what does an investment committee do?" }],
    });
    console.log(`ok (${c.latencyMs} ms, ${c.promptTokens}+${c.completionTokens} tokens, $${c.estimatedCostUsd.toFixed(6)})`);
    console.log(`      → ${reply.replace(/\s+/g, " ").slice(0, 200)}`);
  } catch (err) {
    console.log(`FAILED: ${(err as Error).message}`);
  }
}

const s = tracker.summary();
console.log(`\nTotal: ${s.totalPromptTokens + s.totalCompletionTokens} tokens, $${s.totalUsd.toFixed(6)}`);
