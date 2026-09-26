import { describe, expect, it } from "vitest";
import { define } from "./glossary";

describe("define (metric glossary)", () => {
  it("fills in the period from the label", () => {
    expect(define("SMA50")).toContain("last 50 trading days");
    expect(define("Price vs SMA200")).toContain("last 200 trading days");
  });

  it("prefers the specific entry over the general one", () => {
    expect(define("MACD histogram")).toMatch(/^The gap between the MACD line/);
    expect(define("Forward P/E")).toMatch(/expected earnings/);
  });

  it("explains TTM when the label uses it", () => {
    expect(define("P/E (TTM)")).toContain("trailing twelve months");
    expect(define("RSI (14)")).not.toContain("trailing twelve months");
  });

  it("returns null for labels that need no definition", () => {
    expect(define("Last close")).toBeNull();
    expect(define("Company")).toBeNull();
  });
});
