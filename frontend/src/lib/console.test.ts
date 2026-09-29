import { describe, expect, it } from "vitest";
import type { AgentModel, Health, TapeRow } from "../types";
import { bootLines, parseCommand } from "./console";

describe("parseCommand", () => {
  it("convenes on a bare ticker or after convene/run, uppercased", () => {
    expect(parseCommand(" aapl ")).toEqual({ kind: "convene", ticker: "AAPL", rebuttals: null });
    expect(parseCommand("convene brk.b")).toEqual({ kind: "convene", ticker: "BRK.B", rebuttals: null });
    expect(parseCommand("run NVDA --no-rebuttals")).toEqual({ kind: "convene", ticker: "NVDA", rebuttals: false });
    expect(parseCommand("TSLA --rebuttals")).toEqual({ kind: "convene", ticker: "TSLA", rebuttals: true });
  });

  it("knows its commands", () => {
    expect(parseCommand("")).toEqual({ kind: "none" });
    expect(parseCommand("HELP")).toEqual({ kind: "help" });
    expect(parseCommand("record")).toEqual({ kind: "page", page: "record" });
    expect(parseCommand("compare")).toEqual({ kind: "page", page: "compare" });
    expect(parseCommand("rebuttals off")).toEqual({ kind: "rebuttals", on: false });
    expect(parseCommand("clear")).toEqual({ kind: "clear" });
  });

  it("explains what's wrong instead of convening on junk", () => {
    expect(parseCommand("rebuttals maybe").kind).toBe("error");
    expect(parseCommand("convene").kind).toBe("error");
    expect(parseCommand("AAPL NVDA").kind).toBe("error");
    expect(parseCommand("AAPL --fast").kind).toBe("error");
    expect(parseCommand("$$$").kind).toBe("error");
    expect(parseCommand("../etc").kind).toBe("error");
  });
});

describe("bootLines", () => {
  const agents: AgentModel[] = [
    { id: "technicals", label: "Technicals", tier: "nano", model: "x", why: "" },
    { id: "fundamentals", label: "Fundamentals", tier: "super", model: "x", why: "" },
    { id: "risk", label: "Risk", tier: "super", model: "x", why: "" },
    { id: "chair", label: "Chair", tier: "ultra", model: "x", why: "" },
  ];
  const health = (spent: number, key = true): Health => ({
    status: "ok", demoMode: false, budget: { maxUsd: 0.5, spentUsd: spent }, keys: { tokenFactory: key, fmp: true, finnhub: true },
  });
  const row = (ticker: string, asOf: string): TapeRow => ({ ticker, company: ticker, asOf, close: 1, change: null, spark: [], lastCall: null });

  it("states each tier's seats, the budget and the cache from real data", () => {
    const lines = bootLines(agents, health(0.063), [row("AAPL", "2026-09-25"), row("NVDA", "2026-09-26")]);
    const by = Object.fromEntries(lines.map((l) => [l.label, l]));
    expect(by["nemotron nano"].detail).toBe("technicals");
    expect(by["nemotron super"].detail).toBe("fundamentals, risk");
    expect(by["nemotron ultra"].detail).toBe("chair");
    expect(by["token factory"]).toMatchObject({ status: "ok", detail: "live · $0.063 of $0.500 spent" });
    expect(by["market cache"].detail).toBe("2 stocks on file · closes to 2026-09-26");
  });

  it("warns when live runs can't happen, and waits while loading", () => {
    expect(bootLines(agents, health(0.5), []).find((l) => l.label === "token factory")?.status).toBe("warn");
    expect(bootLines(agents, health(0, false), []).find((l) => l.label === "token factory")?.detail).toMatch(/saved sessions only/);
    expect(bootLines(agents, health(0), []).find((l) => l.label === "market cache")?.status).toBe("warn");
    const zeroCap = { ...health(0.063), budget: { maxUsd: 0, spentUsd: 0.063 } };
    expect(bootLines(agents, zeroCap, []).find((l) => l.label === "token factory")?.detail).toBe("spend cap is $0: saved sessions only");
    expect(bootLines([], null, null).filter((l) => l.status === "wait")).toHaveLength(3);
  });
});
