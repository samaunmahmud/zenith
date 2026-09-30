import { describe, expect, it } from "vitest";
import { ruleFor } from "./SincePanel";

describe("ruleFor", () => {
  it("states the track record's rule for each call", () => {
    expect(ruleFor("BUY", 5)).toContain("ahead of the S&P 500");
    expect(ruleFor("SELL", 5)).toContain("trails the S&P 500");
    expect(ruleFor("HOLD", 5)).toContain("within 5 points");
  });
});

import { watchItems } from "./VerdictPanel";
import type { ChairDecision } from "../../types";

describe("watchItems", () => {
  const decision: ChairDecision = {
    recommendation: "SELL", confidence: 0.7, summary: "", rationale: [], dissent: null, keyRisks: [], timeHorizon: "3-6 months",
    watchFor: [
      { trigger: "above-200d", wouldMoveTo: "HOLD", reason: "Trend repaired." },
      { trigger: "made-up", wouldMoveTo: "BUY", reason: "Not on the menu." },
    ],
  };
  const triggers = [{ id: "above-200d", condition: "The price closes above its 200-day average ($395.40 at the ruling)" }];

  it("words each item from the code's menu and drops anything not on it", () => {
    const items = watchItems(decision, triggers);
    expect(items).toHaveLength(1);
    expect(items[0].condition).toContain("$395.40");
    expect(items[0].status).toBeUndefined();
  });

  it("attaches the check when there is one, and shows nothing for decisions saved before watch lists", () => {
    const checked = [{ ...decision.watchFor![0], condition: "", metOn: "2026-10-14", now: "+1.2% against the 200-day average" }];
    expect(watchItems(decision, triggers, checked)[0].status?.metOn).toBe("2026-10-14");
    expect(watchItems({ ...decision, watchFor: undefined }, triggers)).toEqual([]);
  });
});
