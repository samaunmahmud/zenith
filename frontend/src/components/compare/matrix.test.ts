import { describe, expect, it } from "vitest";
import { initialState, type CommitteeState } from "../../state/committee";
import { edgeOf, preferred, toNumber } from "./matrix";

const withCall = (recommendation: "BUY" | "HOLD" | "SELL", confidence: number): CommitteeState => ({
  ...initialState,
  decision: { recommendation, confidence, summary: "", rationale: [], dissent: null, keyRisks: [], timeHorizon: "" },
});

describe("comparison matrix", () => {
  it("reads the backend's formatted figures", () => {
    expect(toNumber("38.93")).toBe(38.93);
    expect(toNumber("+65.5%")).toBe(65.5);
    expect(toNumber("−20.2%")).toBe(-20.2);
    expect(toNumber("$1,234.50")).toBe(1234.5);
    expect(toNumber("n/a")).toBeNull();
  });

  it("marks the better side only for rows with a direction", () => {
    expect(edgeOf("28.31", "38.93", "lower")).toBe("a");
    expect(edgeOf("-20.2%", "-39.1%", "higher")).toBe("a"); // the smaller drawdown
    expect(edgeOf("55.2", "65.7", null)).toBeNull();
    expect(edgeOf("n/a", "12", "higher")).toBeNull();
    expect(edgeOf("12", "12", "higher")).toBeNull();
  });

  it("prefers the stronger call, then the chair's conviction", () => {
    expect(preferred(withCall("BUY", 0.6), withCall("HOLD", 0.9))).toBe("a");
    expect(preferred(withCall("HOLD", 0.6), withCall("HOLD", 0.8))).toBe("b");
    expect(preferred(withCall("SELL", 0.9), withCall("SELL", 0.6))).toBe("b"); // less sure it should be sold
    expect(preferred(withCall("HOLD", 0.68), withCall("HOLD", 0.68))).toBeNull();
    expect(preferred(withCall("BUY", 0.7), initialState)).toBeNull();
  });
});
