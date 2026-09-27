import { describe, expect, it } from "vitest";
import { initialState, type CommitteeState } from "../../state/committee";
import type { ChairDecision } from "../../types";
import { starters } from "./AskPanel";

const withDecision = (d: Partial<ChairDecision>): CommitteeState => ({
  ...initialState,
  ticker: "TSLA",
  decision: { recommendation: "SELL", confidence: 0.75, summary: "", rationale: [], dissent: null, keyRisks: [], timeHorizon: "3-6 months", ...d },
});

describe("starters", () => {
  it("asks about the call against the nearest alternative, and the dissent when there is one", () => {
    const qs = starters(withDecision({ dissent: { analyst: "technicals", argument: "Momentum." } }));
    expect(qs[0]).toBe("Why SELL and not HOLD?");
    expect(qs[1]).toBe("How strong is the Technicals dissent?");
    expect(qs).toHaveLength(4);
    expect(qs[3]).toContain("TSLA");
  });

  it("offers nothing before the chair has ruled", () => {
    expect(starters({ ...initialState, ticker: "TSLA" })).toEqual([]);
  });
});
