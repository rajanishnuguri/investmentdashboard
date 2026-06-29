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

// ── Live price refresh — MF via mfapi.in, stocks via Yahoo Finance ──

const mfCodeMap    = new Map(); // investmentCode → AMFI scheme code
const mfNavCache   = new Map(); // amfiCode → { nav, date }
const tickerMap    = new Map(); // symbol/name → yahoo ticker
const priceCache   = new Map(); // ticker → { price, currency, ts }
const PRICE_TTL_MS = 5 * 60 * 1000; // 5 min cache

const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "Accept": "application/json",
};

// Fetch a single quote from Yahoo Finance. Returns { price, currency } or null.
async function yahooQuote(ticker) {
  const cached = priceCache.get(ticker);
  if (cached && Date.now() - cached.ts < PRICE_TTL_MS) return cached;
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
    const r = await fetch(url, { headers: YF_HEADERS });
    if (!r.ok) return null;
    const d = await r.json();
    const meta = d?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice ?? meta?.previousClose;
    if (!price) return null;
    const result = { price, currency: meta.currency || "USD", ts: Date.now() };
    priceCache.set(ticker, result);
    return result;
  } catch { return null; }
}

// Search Yahoo Finance for a ticker symbol by name.
// type hint: "US" for US equities/ETFs, "IN" for Indian equities
async function findTicker(name, typeHint) {
  const cacheKey = typeHint + "::" + name;
  if (tickerMap.has(cacheKey)) return tickerMap.get(cacheKey);

  try {
    const q = encodeURIComponent(name.split(" ").slice(0, 5).join(" "));
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${q}&quotesCount=5&newsCount=0`;
    const r = await fetch(url, { headers: YF_HEADERS });
    if (!r.ok) return null;
    const d = await r.json();
    const quotes = d?.quotes || [];

    let hit = null;
    if (typeHint === "IN") {
      // Prefer .NS (NSE) symbols for Indian equities
      hit = quotes.find(q => q.symbol?.endsWith(".NS") && ["EQUITY","ETF"].includes(q.quoteType))
         || quotes.find(q => q.symbol?.endsWith(".BO") && ["EQUITY","ETF"].includes(q.quoteType));
    } else {
      // US: prefer symbols without exchange suffix (NYSE/NASDAQ listed)
      hit = quotes.find(q => ["ETF","EQUITY","MUTUALFUND"].includes(q.quoteType) && !q.symbol?.includes("."))
         || quotes.find(q => ["ETF","EQUITY"].includes(q.quoteType));
    }

    const ticker = hit?.symbol || null;
    tickerMap.set(cacheKey, ticker);
    return ticker;
  } catch { return null; }
}

// USD → INR conversion rate (cached 5 min)
let usdInrCache = null;
async function getUsdInr() {
  if (usdInrCache && Date.now() - usdInrCache.ts < PRICE_TTL_MS) return usdInrCache.rate;
  const q = await yahooQuote("USDINR=X");
  const rate = q?.price || 84;
  usdInrCache = { rate, ts: Date.now() };
  return rate;
}

// MF NAV via mfapi.in
async function fetchMfNav(investmentCode, fundName) {
  const today = new Date().toDateString();
  let amfi = mfCodeMap.get(investmentCode);

  if (!amfi) {
    try {
      const r = await fetch(`https://api.mfapi.in/mf/${investmentCode}`);
      if (r.ok) {
        const d = await r.json();
        if (d.data?.[0]?.nav) { amfi = investmentCode; mfCodeMap.set(investmentCode, amfi); }
      }
    } catch { /* ignore */ }
  }

  if (!amfi && fundName) {
    try {
      const q = encodeURIComponent(fundName.split(" ").slice(0, 5).join(" "));
      const r = await fetch(`https://api.mfapi.in/mf/search?q=${q}`);
      if (r.ok) {
        const results = await r.json();
        if (results?.[0]?.schemeCode) {
          amfi = String(results[0].schemeCode);
          mfCodeMap.set(investmentCode, amfi);
        }
      }
    } catch { /* ignore */ }
  }

  if (!amfi) return null;

  const cached = mfNavCache.get(amfi);
  if (cached?.date === today) return cached.nav;

  try {
    const r = await fetch(`https://api.mfapi.in/mf/${amfi}`);
    if (r.ok) {
      const d = await r.json();
      if (d.data?.[0]?.nav) {
        const nav = parseFloat(d.data[0].nav);
        mfNavCache.set(amfi, { nav, date: today });
        return nav;
      }
    }
  } catch { /* ignore */ }
  return null;
}

function applyPriceUpdate(h, newUnitPriceInr) {
  if (newUnitPriceInr == null || !h.quantity) return false;
  h.unitPrice = newUnitPriceInr;
  h.current = h.quantity * newUnitPriceInr;
  const pnl = h.current - (h.invested || 0);
  h.pnl = pnl;
  h.absoluteReturn = pnl;
  h.absoluteReturnPct = h.invested ? (pnl / h.invested) * 100 : null;
  h.pnlPct = h.absoluteReturnPct;
  return true;
}

// Refresh prices: MF from mfapi.in, US stocks/ETFs/REITs + Indian equities from Yahoo Finance.
app.post("/api/prices/refresh", wrap(async (req, res) => {
  const cache = loadCache();
  let updated = 0;

  // Fetch USD/INR once if we have any US holdings
  const hasUs = Object.values(cache).some(b =>
    (b.holdings || []).some(h => h.assetType === "US_STOCK")
  );
  const usdInr = hasUs ? await getUsdInr() : null;

  for (const brokerData of Object.values(cache)) {
    if (!Array.isArray(brokerData.holdings)) continue;

    for (const h of brokerData.holdings) {
      if (!h.quantity) continue;

      if (h.assetType === "MF") {
        const nav = await fetchMfNav(h.investmentCode, h.symbol);
        if (applyPriceUpdate(h, nav)) updated++;

      } else if (h.assetType === "US_STOCK") {
        // Find ticker (ETFs like VOO, VT; REITs like O, AMT; stocks like AAPL)
        let ticker = await findTicker(h.symbol, "US");
        if (ticker) {
          const q = await yahooQuote(ticker);
          if (q) {
            // Yahoo returns USD; convert to INR
            const priceInr = q.price * (usdInr || 84);
            if (applyPriceUpdate(h, priceInr)) updated++;
          }
        }

      } else if (h.exchange === "NSE" || h.exchange === "BSE") {
        // Indian equities from Kite — try NSE first
        const suffix = h.exchange === "BSE" ? ".BO" : ".NS";
        const ticker = h.symbol + suffix;
        const q = await yahooQuote(ticker);
        if (q) {
          if (applyPriceUpdate(h, q.price)) updated++;
        } else {
          // fallback: search by name
          const found = await findTicker(h.symbol, "IN");
          if (found) {
            const q2 = await yahooQuote(found);
            if (q2 && applyPriceUpdate(h, q2.price)) updated++;
          }
        }
      }
      // EPF, PPF, NPS, BOND — no live price source, skip
    }
  }

  const refreshedAt = new Date().toISOString();
  if (updated > 0) {
    for (const brokerData of Object.values(cache)) brokerData.savedAt = refreshedAt;
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  }

  const allHoldings = Object.values(cache).flatMap(b => b.holdings || []);
  res.json({ updated, refreshedAt, usdInr, holdings: allHoldings });
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
