import { describe, expect, it } from "vitest";
import { pinRows, splitSource } from "./Verdict";

describe("pinRows (vote track label layout)", () => {
  it("keeps well-separated markers on one row", () => {
    expect(pinRows([10, 50, 90])).toEqual([0, 0, 0]);
  });

  it("gives three identical positions three rows", () => {
    expect(pinRows([50, 50, 50])).toEqual([0, 1, 2]);
  });

  it("reuses a row once a marker is far enough from that row's last one", () => {
    // 50 and 60 clash, 70 clashes with 60 but not with 50
    expect(pinRows([50, 60, 70])).toEqual([0, 1, 0]);
  });

  it("returns rows in the input order, whatever order the positions are in", () => {
    expect(pinRows([90, 10, 85])).toEqual([1, 0, 0]); // 90 clashes with 85
  });
});

describe("splitSource (chair's source tags)", () => {
  it("lifts a leading [tag] off the text", () => {
    expect(splitSource("[Fundamentals + Risk] Both flag valuation.")).toEqual({ source: "Fundamentals + Risk", body: "Both flag valuation." });
  });

  it("leaves untagged text and later brackets alone", () => {
    expect(splitSource("Margins [TTM] are high.")).toEqual({ source: null, body: "Margins [TTM] are high." });
  });
});
