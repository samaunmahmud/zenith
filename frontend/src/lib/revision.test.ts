import { describe, expect, it } from "vitest";
import type { Rebuttal } from "../types";
import { afterRebuttal, shiftLabel, shiftTitle } from "./revision";

const base: Rebuttal = { analyst: "risk", respondingTo: "fundamentals", response: "Fair point.", stanceChanged: false };
const moved: Rebuttal = { ...base, stanceChanged: true, stanceBefore: "bullish", confidenceBefore: 0.7, stanceAfter: "neutral", confidenceAfter: 0.55 };

describe("revision", () => {
  it("labels a measured change with both ends and an older self-reported one as revised", () => {
    expect(shiftLabel(moved)).toBe("bullish → neutral");
    expect(shiftLabel({ ...base, stanceChanged: true })).toBe("revised");
    expect(shiftLabel(base)).toBeNull();
    expect(shiftLabel(undefined)).toBeNull();
  });

  it("gives the position after the round only when it was measured", () => {
    expect(afterRebuttal(moved)).toEqual({ stance: "neutral", confidence: 0.55 });
    expect(afterRebuttal({ ...base, stanceChanged: true })).toBeNull();
    expect(afterRebuttal(undefined)).toBeNull();
  });

  it("says in the tooltip whether the change was compared in code", () => {
    expect(shiftTitle(moved)).toContain("bullish 70% in its report, neutral 55% afterwards");
    expect(shiftTitle({ ...base, stanceChanged: true })).toContain("as the analyst reported it");
  });
});
