import { describe, expect, it } from "vitest";
import { ruleFor } from "./SincePanel";

describe("ruleFor", () => {
  it("states the track record's rule for each call", () => {
    expect(ruleFor("BUY", 5)).toContain("ahead of the S&P 500");
    expect(ruleFor("SELL", 5)).toContain("trails the S&P 500");
    expect(ruleFor("HOLD", 5)).toContain("within 5 points");
  });
});
