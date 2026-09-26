import { describe, expect, it } from "vitest";
import { allowedNumbers, unsupportedNumbers } from "./numberCheck.js";

const input = ["P/E (TTM): 31.42", "Gross margin (TTM): 46.2%", "Last close: $1,234.50", "1-year return: -12.3%"];
const allowed = allowedNumbers(input);

describe("unsupportedNumbers", () => {
  it("accepts numbers copied from the input, including rounded and unsigned forms", () => {
    expect(unsupportedNumbers("P/E of 31.42 and margins of 46.2%", allowed)).toEqual([]);
    expect(unsupportedNumbers("a P/E around 31 with 46% gross margin", allowed)).toEqual([]);
    expect(unsupportedNumbers("down 12.3% over the year, trading at $1,234.50", allowed)).toEqual([]);
  });

  it("flags invented numbers", () => {
    expect(unsupportedNumbers("P/E of 35.0 and a price target of $1,500", allowed)).toEqual(["35.0", "1,500"]);
  });

  it("flags over-precise numbers that the input doesn't support", () => {
    expect(unsupportedNumbers("P/E of 31.49", allowed)).toEqual(["31.49"]);
  });

  it("ignores indicator names, dates, years and small counts", () => {
    expect(unsupportedNumbers("SMA200 and RSI (14) since 2026-03-14; 52-week range; 3 risks in 2025", allowed)).toEqual([]);
  });
});
