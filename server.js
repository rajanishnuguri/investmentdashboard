// server.js
// Serves the dashboard (public/) AND the /api endpoints from the SAME origin.
// That single fact removes the only CORS problem that mattered: the browser
// talks to this server, and this server talks to the brokers. No cross-origin
// broker calls, no API keys in the page.

import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { BrokerSession } from "./mcp.js";
import { beginOAuth, completeOAuth } from "./oauth.js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Compile JSX once at startup so the browser never needs Babel.
function buildApp() {
  const babel = require("@babel/core");
  const src = fs.readFileSync(path.join(__dirname, "src", "app.jsx"), "utf8");
  const { code } = babel.transformSync(src, {
    presets: [["@babel/preset-react", { runtime: "classic" }]],
    filename: "app.jsx",
  });
  const out = path.join(__dirname, "public", "vendor", "app.js");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, code);
}
buildApp();
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

// Persistence — last fetched portfolio is saved here so a page refresh still
// shows data even if the MCP session has been disconnected.
const CACHE_FILE = path.join(__dirname, ".portfolio-cache.json");

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch { return {}; }
}

function saveCache(broker, data) {
  const cache = loadCache();
  cache[broker] = { ...data, savedAt: new Date().toISOString() };
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

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
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:;"
  );
  next();
});

// Everything — index.html, vendor JS/CSS, favicon — lives in public/.
const PUBLIC = path.join(__dirname, "public");
app.use(express.static(PUBLIC));

app.get("/", (_req, res) => {
  const indexFile = path.join(PUBLIC, "index.html");
  if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
  res.status(500).type("text/plain").send("index.html not found in public/");
});

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((e) => {
    const body = { error: String(e?.message || e) };
    if (e?.loginUrl) body.loginUrl = e.loginUrl;
    res.status(e?.message === "LOGIN_REQUIRED" ? 401 : 500).json(body);
  });

app.get("/api/status", wrap(async (_req, res) => {
  const cache = loadCache();
  const out = {};
  for (const [key, cfg] of Object.entries(BROKERS)) {
    const s = sessions.get(key);
    const cached = cache[key];
    out[key] = {
      label: cfg.label,
      url: cfg.url,
      connected: !!s?.connected,
      authed: !!s?.authed,
      tools: s?.tools?.map((t) => t.name) || [],
      loginUrl: s?.loginUrl || null,
      // Include last-known holdings so the UI can restore state on refresh.
      cachedHoldings: cached?.holdings || null,
      cachedAt: cached?.savedAt || null,
    };
  }
  res.json({ brokers: out });
}));

// Start broker login. Returns { loginUrl } to open in a new tab.
app.post("/api/:broker/connect", wrap(async (req, res) => {
  const broker = req.params.broker;
  const s = getSession(broker);
  if (!s) return res.status(404).json({ error: "Unknown broker" });

  // Try the standard MCP login tool flow first.
  // If the server is auth-gated (e.g. INDmoney), fall through to OAuth.
  try {
    const result = await s.beginLogin();
    if (result.loginUrl || result.note) {
      return res.json({ ...result, tools: s.tools.map((t) => t.name) });
    }
  } catch (e) {
    if (!String(e?.message).includes("invalid_token") &&
        !String(e?.message).includes("Authentication required") &&
        !String(e?.message).includes("No login")) throw e;
  }

  // OAuth 2.0 + PKCE flow for auth-gated servers.
  const callbackUrl = `${req.protocol}://${req.get("host")}/api/${broker}/callback`;
  const { loginUrl } = await beginOAuth(s.url, callbackUrl);
  s.loginUrl = loginUrl;
  res.json({ loginUrl, tools: [] });
}));

// OAuth callback — INDmoney redirects here after the user logs in.
app.get("/api/:broker/callback", wrap(async (req, res) => {
  const broker = req.params.broker;
  const s = sessions.get(broker);
  if (!s) return res.status(404).send("Unknown broker");

  const { code, state, error } = req.query;
  if (error) return res.status(400).send(`OAuth error: ${error}`);
  if (!code || !state) return res.status(400).send("Missing code or state");

  const callbackUrl = `${req.protocol}://${req.get("host")}/api/${broker}/callback`;
  const { tokens } = await completeOAuth(code, state, callbackUrl);
  await s.setAuthToken(tokens.access_token);

  // Close the popup and tell the user to go back to the dashboard.
  res.send(`<html><body style="font-family:system-ui;text-align:center;padding:60px">
    <h2 style="color:#0E9E86">Connected to ${BROKERS[broker]?.label || broker}!</h2>
    <p>You can close this tab and click <strong>Load</strong> in the dashboard.</p>
    <script>window.close();</script>
  </body></html>`);
}));

// Pull holdings/portfolio. 401 + { loginUrl } if the broker still needs login.
// Falls back to the last cached snapshot if the session isn't connected.
app.get("/api/:broker/portfolio", wrap(async (req, res) => {
  const broker = req.params.broker;
  const s = getSession(broker);
  if (!s) return res.status(404).json({ error: "Unknown broker" });

  try {
    const data = await s.fetchPortfolio();
    saveCache(broker, data);
    res.json({ broker, ...data });
  } catch (e) {
    // If live fetch fails (e.g. session expired), try the cache.
    const cached = loadCache()[broker];
    if (cached && (e?.message === "LOGIN_REQUIRED" || !s.authed)) {
      return res.json({ broker, ...cached, fromCache: true });
    }
    throw e;
  }
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
