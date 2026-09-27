import { describe, expect, it } from "vitest";
import { firstAnalyst, splitSource } from "./rationale";

describe("splitSource (chair's source tags)", () => {
  it("lifts a leading [tag] off the text", () => {
    expect(splitSource("[Fundamentals + Risk] Both flag valuation.")).toEqual({ source: "Fundamentals + Risk", body: "Both flag valuation." });
  });

  it("leaves untagged text and later brackets alone", () => {
    expect(splitSource("Margins [TTM] are high.")).toEqual({ source: null, body: "Margins [TTM] are high." });
  });
});

describe("firstAnalyst", () => {
  it("colours a joint tag by the first analyst it names", () => {
    expect(firstAnalyst("Risk + Fundamentals")).toBe("risk");
    expect(firstAnalyst("News")).toBeNull();
    expect(firstAnalyst(null)).toBeNull();
  });
});
