// server.js
// Serves the dashboard (public/) AND the /api endpoints from the SAME origin.
// That single fact removes the only CORS problem that mattered: the browser
// talks to this server, and this server talks to the brokers. No cross-origin
// broker calls, no API keys in the page.

import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { BrokerSession } from "./mcp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8787;

// Broker MCP endpoints. Override via env if these ever change.
// Kite's hosted endpoint is public + documented. INDmoney's exact MCP URL is
// configurable here; set INDMONEY_MCP_URL if the default isn't right for you.
const BROKERS = {
  kite: {
    label: "Zerodha · Kite",
    url: process.env.KITE_MCP_URL || "https://mcp.kite.trade/mcp",
  },
  indmoney: {
    label: "INDmoney",
    url: process.env.INDMONEY_MCP_URL || "https://mcp.indmoney.com/mcp",
  },
};

// Live sessions, kept in memory so an authenticated MCP session survives between
// the "connect" call and later "portfolio" calls. (For multi-user / production,
// you'd key these by a real user session instead of globally.)
const sessions = new Map();

function getSession(key) {
  const cfg = BROKERS[key];
  if (!cfg) return null;
  if (!sessions.has(key)) {
    sessions.set(key, new BrokerSession(key, cfg.url));
  }
  return sessions.get(key);
}

const app = express();
app.use(express.json());

// Babel Standalone (used for in-browser JSX transpilation) requires eval().
app.use((_req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.tailwindcss.com https://unpkg.com; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:;"
  );
  next();
});

app.use(express.static(path.join(__dirname, "public")));

// Find the dashboard whether it's in public/ or sitting next to server.js,
// so a flattened download still works.
const INDEX_CANDIDATES = [
  path.join(__dirname, "public", "index.html"),
  path.join(__dirname, "index.html"),
];
const indexFile = INDEX_CANDIDATES.find((p) => fs.existsSync(p));

app.get("/", (_req, res) => {
  if (indexFile) return res.sendFile(indexFile);
  res
    .status(500)
    .type("text/plain")
    .send(
      "index.html not found. Put it at wealth-trajectory/public/index.html " +
      "(or next to server.js) and restart."
    );
});

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((e) => {
    const body = { error: String(e?.message || e) };
    if (e?.loginUrl) body.loginUrl = e.loginUrl;
    res.status(e?.message === "LOGIN_REQUIRED" ? 401 : 500).json(body);
  });

app.get("/api/status", wrap(async (_req, res) => {
  const out = {};
  for (const [key, cfg] of Object.entries(BROKERS)) {
    const s = sessions.get(key);
    out[key] = {
      label: cfg.label,
      url: cfg.url,
      connected: !!s?.connected,
      authed: !!s?.authed,
      tools: s?.tools?.map((t) => t.name) || [],
      loginUrl: s?.loginUrl || null,
    };
  }
  res.json({ brokers: out });
}));

// Start broker login. Returns { loginUrl } to open in a new tab.
app.post("/api/:broker/connect", wrap(async (req, res) => {
  const s = getSession(req.params.broker);
  if (!s) return res.status(404).json({ error: "Unknown broker" });
  const result = await s.beginLogin();
  res.json({ ...result, tools: s.tools.map((t) => t.name) });
}));

// Pull holdings/portfolio. 401 + { loginUrl } if the broker still needs login.
app.get("/api/:broker/portfolio", wrap(async (req, res) => {
  const s = getSession(req.params.broker);
  if (!s) return res.status(404).json({ error: "Unknown broker" });
  const data = await s.fetchPortfolio();
  res.json({ broker: req.params.broker, ...data });
}));

app.get("/api/:broker/tools", wrap(async (req, res) => {
  const s = getSession(req.params.broker);
  if (!s) return res.status(404).json({ error: "Unknown broker" });
  await s.ensureClient();
  res.json({
    tools: s.tools.map((t) => ({ name: t.name, description: t.description || "" })),
  });
}));

// Call any tool by name — handy for discovering your real schema in the Data tab.
app.post("/api/:broker/tool", wrap(async (req, res) => {
  const s = getSession(req.params.broker);
  if (!s) return res.status(404).json({ error: "Unknown broker" });
  const { name, arguments: args } = req.body || {};
  if (!name) return res.status(400).json({ error: "Missing tool name" });
  const out = await s.callTool(name, args);
  res.json(out);
}));

app.post("/api/:broker/disconnect", wrap(async (req, res) => {
  const s = sessions.get(req.params.broker);
  if (s) await s.close();
  sessions.delete(req.params.broker);
  res.json({ ok: true });
}));

const server = app.listen(PORT, () => {
  console.log(`\n  Wealth Trajectory running →  http://localhost:${PORT}\n`);
  console.log("  Brokers configured:");
  for (const [k, c] of Object.entries(BROKERS)) console.log(`   • ${k.padEnd(9)} ${c.url}`);
  console.log("");
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`\n  Port ${PORT} is already in use. Run this to free it:\n`);
    console.error(`    kill $(lsof -ti tcp:${PORT})\n`);
    console.error(`  Then start the server again.\n`);
    process.exit(1);
  } else {
    throw e;
  }
});
