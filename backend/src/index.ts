import express from "express";
import { config } from "./config.js";

const app = express();
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// TODO (Phase 2): POST /api/committee — see CLAUDE.md section 5

app.listen(config.port, () => {
  console.log(`Backend running on http://localhost:${config.port}`);
});
