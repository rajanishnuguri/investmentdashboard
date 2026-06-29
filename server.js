// server.js
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { BrokerSession } from "./mcp.js";
import { beginOAuth, completeOAuth } from "./oauth.js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

const USERS = {
  rajanish: { label: "Rajanish" },
  aswini:   { label: "Aswini" },
};

const BROKERS = {
  kite: {
    label: "Zerodha · Kite",
    url: process.env.KITE_MCP_URL || "https://mcp.kite.trade/mcp",
  },
  indmoney: {
    label: "INDmoney",
    url: process.env.INDMONEY_MCP_URL || "https://mcp.indmoney.com/mcp",
  },
  truthifi: {
    label: "Truthifi (401k / ESOP)",
    url: null,       // fetched via Claude MCP, not server-side — cache only
    claudeSync: true,
  },
};

// Which brokers each user has access to
const USER_BROKERS = {
  rajanish: ["kite", "indmoney"],
  aswini:   ["kite", "indmoney", "truthifi"],
};

// Sessions keyed by "user::broker"
const sessions = new Map();

const CACHE_FILE = path.join(__dirname, ".portfolio-cache.json");

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch { return {}; }
}

function saveCache(user, broker, data) {
  const cache = loadCache();
  if (!cache[user]) cache[user] = {};
  cache[user][broker] = { ...data, savedAt: new Date().toISOString() };
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

function getSession(user, broker) {
  const cfg = BROKERS[broker];
  if (!cfg || !USERS[user]) return null;
  const key = `${user}::${broker}`;
  if (!sessions.has(key)) {
    sessions.set(key, new BrokerSession(broker, cfg.url));
  }
  return sessions.get(key);
}

const app = express();
app.use(express.json());

app.use((_req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:;"
  );
  next();
});

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
  for (const [user, uCfg] of Object.entries(USERS)) {
    out[user] = { label: uCfg.label, brokers: {} };
    for (const broker of (USER_BROKERS[user] || [])) {
      const bCfg = BROKERS[broker];
      const cached = cache[user]?.[broker];
      if (bCfg.claudeSync) {
        // Truthifi — served from cache only, no live MCP session
        out[user].brokers[broker] = {
          label: bCfg.label,
          claudeSync: true,
          connected: false,
          authed: false,
          tools: [],
          loginUrl: null,
          cachedHoldings: cached?.holdings || null,
          cachedAt: cached?.savedAt || null,
          usdInr: cached?.usdInr || null,
        };
      } else {
        const key = `${user}::${broker}`;
        const s = sessions.get(key);
        out[user].brokers[broker] = {
          label: bCfg.label,
          connected: !!s?.connected,
          authed: !!s?.authed,
          tools: s?.tools?.map((t) => t.name) || [],
          loginUrl: s?.loginUrl || null,
          cachedHoldings: cached?.holdings || null,
          cachedAt: cached?.savedAt || null,
        };
      }
    }
  }
  res.json({ users: out });
}));

app.post("/api/:user/:broker/connect", wrap(async (req, res) => {
  const { user, broker } = req.params;
  const s = getSession(user, broker);
  if (!s) return res.status(404).json({ error: "Unknown user or broker" });

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

  const callbackUrl = `${req.protocol}://${req.get("host")}/api/${user}/${broker}/callback`;
  const { loginUrl } = await beginOAuth(s.url, callbackUrl);
  s.loginUrl = loginUrl;
  res.json({ loginUrl, tools: [] });
}));

app.get("/api/:user/:broker/callback", wrap(async (req, res) => {
  const { user, broker } = req.params;
  const key = `${user}::${broker}`;
  const s = sessions.get(key);
  if (!s) return res.status(404).send("Unknown user or broker");

  const { code, state, error } = req.query;
  if (error) return res.status(400).send(`OAuth error: ${error}`);
  if (!code || !state) return res.status(400).send("Missing code or state");

  const callbackUrl = `${req.protocol}://${req.get("host")}/api/${user}/${broker}/callback`;
  const { tokens } = await completeOAuth(code, state, callbackUrl);
  await s.setAuthToken(tokens.access_token);

  res.send(`<html><body style="font-family:system-ui;text-align:center;padding:60px">
    <h2 style="color:#0E9E86">Connected to ${BROKERS[broker]?.label || broker} (${USERS[user]?.label || user})!</h2>
    <p>You can close this tab and click <strong>Load</strong> in the dashboard.</p>
    <script>window.close();</script>
  </body></html>`);
}));

app.get("/api/:user/:broker/portfolio", wrap(async (req, res) => {
  const { user, broker } = req.params;
  const s = getSession(user, broker);
  if (!s) return res.status(404).json({ error: "Unknown user or broker" });

  try {
    const data = await s.fetchPortfolio();
    saveCache(user, broker, data);
    res.json({ broker, ...data });
  } catch (e) {
    const cached = loadCache()[user]?.[broker];
    if (cached && (e?.message === "LOGIN_REQUIRED" || !s.authed)) {
      return res.json({ broker, ...cached, fromCache: true });
    }
    throw e;
  }
}));

app.get("/api/:user/:broker/tools", wrap(async (req, res) => {
  const { user, broker } = req.params;
  const s = getSession(user, broker);
  if (!s) return res.status(404).json({ error: "Unknown user or broker" });
  await s.ensureClient();
  res.json({
    tools: s.tools.map((t) => ({ name: t.name, description: t.description || "" })),
  });
}));

app.post("/api/:user/:broker/tool", wrap(async (req, res) => {
  const { user, broker } = req.params;
  const s = getSession(user, broker);
  if (!s) return res.status(404).json({ error: "Unknown user or broker" });
  const { name, arguments: args } = req.body || {};
  if (!name) return res.status(400).json({ error: "Missing tool name" });
  const out = await s.callTool(name, args);
  res.json(out);
}));

app.post("/api/:user/:broker/disconnect", wrap(async (req, res) => {
  const { user, broker } = req.params;
  const key = `${user}::${broker}`;
  const s = sessions.get(key);
  if (s) await s.close();
  sessions.delete(key);
  res.json({ ok: true });
}));

const server = app.listen(PORT, () => {
  console.log(`\n  Wealth Trajectory running →  http://localhost:${PORT}\n`);
  console.log("  Users: " + Object.values(USERS).map(u => u.label).join(", "));
  console.log("  Brokers: " + Object.keys(BROKERS).join(", "));
  console.log("");
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`\n  Port ${PORT} is already in use. Run this to free it:\n`);
    console.error(`    kill $(lsof -ti tcp:${PORT})\n`);
    process.exit(1);
  } else {
    throw e;
  }
});
