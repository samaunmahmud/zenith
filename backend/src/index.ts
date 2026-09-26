import express, { type Request, type Response } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { ANALYST_ORDER, ANALYSTS, CHAIR, NEWS_DESK } from "./agents/roster.js";
import { config, REPO_ROOT } from "./config.js";
import { DataError } from "./data/types.js";
import { LlmError } from "./llm/client.js";
import { lastSavedRun, runCommittee } from "./orchestrator/committee.js";
import type { CommitteeEvent, CommitteeResult } from "./orchestrator/types.js";

const app = express();
app.use(express.json());

const TICKER = /^[A-Z][A-Z0-9.\-]{0,9}$/;

function parseTicker(raw: unknown): string | null {
  const t = String(raw ?? "").trim().toUpperCase();
  return TICKER.test(t) ? t : null;
}

function statusFor(err: unknown): number {
  if (err instanceof DataError) return err.status;
  if (err instanceof LlmError) return 502;
  if ((err as Error)?.message?.startsWith("Missing environment variable")) return 503; // not configured
  return 500;
}

function envStatus() {
  const has = (k: string) => Boolean(process.env[k]);
  return {
    tokenFactory: has("TOKEN_FACTORY_API_KEY") && has("TOKEN_FACTORY_BASE_URL"),
    fmp: has("FMP_API_KEY"),
    finnhub: has("FINNHUB_API_KEY"),
  };
}

/**
 * Run the committee; if it fails and we have a saved run for this ticker, serve that instead
 * (clearly flagged as a replay). This is what keeps a live demo from ever showing a blank screen.
 */
async function runWithFallback(ticker: string, rebuttals: boolean, emit?: (e: CommitteeEvent) => void): Promise<CommitteeResult> {
  try {
    return await runCommittee(ticker, { rebuttals }, emit);
  } catch (err) {
    const saved = await lastSavedRun(ticker);
    if (saved) {
      console.warn(`[api] live run failed for ${ticker}, replaying last saved run: ${(err as Error).message}`);
      return saved;
    }
    throw err;
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", demoMode: config.demoMode, keys: envStatus() });
});

app.get("/api/config", (_req, res) => {
  const models = envStatus().tokenFactory ? config.tokenFactory().models : null;
  res.json({
    demoMode: config.demoMode,
    demoTickers: config.demoTickers,
    agents: [NEWS_DESK, ...ANALYST_ORDER.map((a) => ANALYSTS[a]), CHAIR].map((a) => ({
      ...a,
      model: models?.[a.tier] ?? null,
    })),
  });
});

// Plain request/response version.
app.post("/api/committee", async (req: Request, res: Response) => {
  const ticker = parseTicker(req.body?.ticker);
  if (!ticker) return res.status(400).json({ error: "Enter a valid ticker symbol, e.g. AAPL" });
  try {
    res.json(await runWithFallback(ticker, Boolean(req.body?.rebuttals)));
  } catch (err) {
    console.error(`[api] committee failed for ${ticker}:`, err);
    res.status(statusFor(err)).json({ error: (err as Error).message });
  }
});

// Server-Sent Events version: analyst cards appear as each agent finishes.
app.get("/api/committee/stream", async (req: Request, res: Response) => {
  const ticker = parseTicker(req.query.ticker);
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // stop proxies buffering the stream
  });
  const send = (e: CommitteeEvent) => res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000);

  if (!ticker) {
    send({ type: "error", message: "Enter a valid ticker symbol, e.g. AAPL", status: 400 });
    clearInterval(heartbeat);
    return res.end();
  }
  try {
    const result = await runWithFallback(ticker, req.query.rebuttals === "true", send);
    send({ type: "done", result });
  } catch (err) {
    console.error(`[api] committee stream failed for ${ticker}:`, err);
    send({ type: "error", message: (err as Error).message, status: statusFor(err) });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

// In production the backend also serves the built frontend (one container, one URL).
const frontendDist = path.join(REPO_ROOT, "frontend", "dist");
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(frontendDist, "index.html")));
}

app.listen(config.port, () => {
  console.log(`Zenith backend on http://localhost:${config.port} (demo mode: ${config.demoMode ? "on" : "off"})`);
});
