// server.js
import "./env.js";
import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { BrokerSession } from "./mcp.js";
import { beginOAuth, completeOAuth } from "./oauth.js";
import { loadFromDrive, saveToDrive } from "./gdrive.js";

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
    label: "Truthifi · 401k / ESOP",
    url: process.env.TRUTHIFI_MCP_URL || "https://api.truthifi.com/mcp",
    // Rate limited: ~5 calls/day, 25/month. Connect once; data is cached after Load.
  },
};

// Which brokers each user has access to
const USER_BROKERS = {
  rajanish: ["kite", "indmoney"],
  aswini:   ["kite", "indmoney", "truthifi"],
};

// Which asset kind a manual entry is — drives which fields the form shows and
// how the note line is built. Add here if a new kind of manual asset shows up.
const MANUAL_KINDS = ["ESOP", "FD"];

// Users who can add manually-entered assets (e.g. a foreign ESOP account or an
// FCNR deposit — anything with no MCP server). Stored in their native
// currency, converted to INR live.
const USER_MANUAL = { rajanish: true, aswini: true };

// Live FX rate for a manual entry's currency.
const MANUAL_FX = { EUR: () => fetchEurInr(), USD: () => fetchUsdInr() };

// Users who can track liabilities, a target allocation, and named goals.
// All INR-native features, no currency conversion needed.
const USER_LIABILITIES = { rajanish: true, aswini: true };
const USER_TARGET_ALLOCATION = { rajanish: true, aswini: true };
const USER_GOALS = { rajanish: true, aswini: true };

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

  // Never let an empty fetch clobber holdings we already have cached for this
  // broker — only overwrite when the new fetch actually returned something.
  const hasNewHoldings = Array.isArray(data.holdings) && data.holdings.length > 0;
  const hasExistingHoldings = Array.isArray(cache[user][broker]?.holdings) && cache[user][broker].holdings.length > 0;
  if (!hasNewHoldings && hasExistingHoldings) return;

  cache[user][broker] = { ...data, savedAt: new Date().toISOString() };
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  // Async sync to Google Drive — don't await, never blocks the response.
  // Pushes the full cache (all users/brokers), but only this broker's slice
  // just changed — everything else is untouched, so the remote file still
  // ends up as an accurate full snapshot of exactly what's cached locally.
  saveToDrive(cache).catch(() => {});
}

function loadManualEntries(user) {
  const cache = loadCache();
  return cache[user]?.manual?.entries || [];
}

function saveManualEntries(user, entries) {
  const cache = loadCache();
  if (!cache[user]) cache[user] = {};
  cache[user].manual = { entries, savedAt: new Date().toISOString() };
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  saveToDrive(cache).catch(() => {});
}

function loadLiabilities(user) {
  const cache = loadCache();
  return cache[user]?.liabilities?.entries || [];
}
function saveLiabilities(user, entries) {
  const cache = loadCache();
  if (!cache[user]) cache[user] = {};
  cache[user].liabilities = { entries, savedAt: new Date().toISOString() };
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  saveToDrive(cache).catch(() => {});
}

function loadTargetAllocation(user) {
  const cache = loadCache();
  return cache[user]?.targetAllocation?.targets || null;
}
function saveTargetAllocation(user, targets) {
  const cache = loadCache();
  if (!cache[user]) cache[user] = {};
  cache[user].targetAllocation = { targets, savedAt: new Date().toISOString() };
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  saveToDrive(cache).catch(() => {});
}

function loadGoals(user) {
  const cache = loadCache();
  return cache[user]?.goals?.entries || [];
}
function saveGoals(user, entries) {
  const cache = loadCache();
  if (!cache[user]) cache[user] = {};
  cache[user].goals = { entries, savedAt: new Date().toISOString() };
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  saveToDrive(cache).catch(() => {});
}

// One net-worth snapshot per calendar day per user, so a trend can build up
// over time without writing (and Drive-syncing) on every single page load.
function upsertHistorySnapshot(user, current, invested) {
  const cache = loadCache();
  if (!cache.history) cache.history = {};
  if (!cache.history[user]) cache.history[user] = [];
  const today = new Date().toISOString().slice(0, 10);
  const list = cache.history[user];
  const last = list[list.length - 1];
  if (last && last.date === today) return; // already snapshotted today
  list.push({ date: today, current, invested });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  saveToDrive(cache).catch(() => {});
}

// Build the note line for a manual entry — FDs show bank/rate/maturity even
// if the user didn't type a custom note; ESOPs just show whatever note they typed.
function manualNote(e) {
  if (e.type === "FD") {
    return [e.bank, e.interestRate != null ? `${e.interestRate}% p.a.` : null,
      e.maturityDate ? `matures ${e.maturityDate}` : null, e.note]
      .filter(Boolean).join(" · ") || null;
  }
  return e.note || null;
}

// Normalise a manually-entered asset (stored in its native currency) into the
// same holding shape broker holdings use, converting to INR with the live rate.
function toManualHolding(e, rates) {
  const rate = rates[e.currency] || 0;
  const current = e.value != null ? e.value * rate : null;
  const invested = e.invested != null ? e.invested * rate : null;
  const pnl = invested != null && current != null ? current - invested : null;
  const pnlPct = invested ? (pnl / invested) * 100 : null;
  return {
    id: e.id,
    symbol: e.name,
    exchange: e.currency,
    assetType: e.type,
    broker: e.type === "FD" ? (e.bank || "") : "Amundi",
    investmentCode: e.id,
    unitPrice: e.unitPrice != null ? e.unitPrice * rate : null,
    quantity: e.units != null ? e.units : null,
    invested, current,
    pnl, pnlPct, absoluteReturn: pnl, absoluteReturnPct: pnlPct,
    dividendEarned: null, totalReturn: pnl, totalReturnPct: pnlPct,
    returnWithDividends: pnlPct, returnWithoutDividends: pnlPct,
    xirr: null, benchmarkXirr: null, cagr: null,
    source: "manual",
    nativeValue: e.value, nativeInvested: e.invested ?? null, fxRate: rate,
    currency: e.currency, interestRate: e.interestRate ?? null,
    openDate: e.openDate || null, maturityDate: e.maturityDate || null,
    asOf: e.asOf || null, note: manualNote(e),
  };
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
// Render (and most PaaS) terminate HTTPS at their edge and forward plain HTTP
// to this process. Without trusting that proxy, req.protocol always reports
// "http", which breaks the OAuth callback URL built below (INDmoney/Truthifi
// reject a redirect_uri that isn't https:// for a public host).
app.set("trust proxy", 1);
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
    let assetsTotal = 0, investedTotal = 0;
    for (const broker of (USER_BROKERS[user] || [])) {
      const bCfg = BROKERS[broker];
      const cached = cache[user]?.[broker];
      const key = `${user}::${broker}`;
      const s = sessions.get(key);
      const holdings = cached?.holdings || [];
      assetsTotal += holdings.reduce((sum, h) => sum + (h.current || 0), 0);
      investedTotal += holdings.reduce((sum, h) => sum + (h.invested || 0), 0);
      out[user].brokers[broker] = {
        label: bCfg.label,
        connected: !!s?.connected,
        authed: !!s?.authed,
        tools: s?.tools?.map((t) => t.name) || [],
        loginUrl: s?.loginUrl || null,
        cachedHoldings: cached?.holdings || null,
        cachedAt: cached?.savedAt || null,
        usdInr: cached?.usdInr || null,
        rateLimited: broker === "truthifi",
      };
    }
    if (USER_MANUAL[user]) {
      const entries = loadManualEntries(user);
      const [eurInr, usdInr] = await Promise.all([fetchEurInr(), fetchUsdInr()]);
      const rates = { EUR: eurInr, USD: usdInr };
      const manualHoldings = entries.map((e) => toManualHolding(e, rates));
      assetsTotal += manualHoldings.reduce((sum, h) => sum + (h.current || 0), 0);
      investedTotal += manualHoldings.reduce((sum, h) => sum + (h.invested || 0), 0);
      out[user].brokers.manual = {
        label: "Manual assets",
        manual: true,
        connected: true,
        authed: entries.length > 0,
        tools: [],
        loginUrl: null,
        entries,
        cachedHoldings: manualHoldings,
        cachedAt: loadCache()[user]?.manual?.savedAt || null,
        rates,
      };
    }
    let liabilitiesTotal = 0;
    if (USER_LIABILITIES[user]) {
      const entries = loadLiabilities(user);
      liabilitiesTotal = entries.reduce((sum, e) => sum + (e.amount || 0), 0);
      out[user].liabilities = { entries, total: liabilitiesTotal, savedAt: cache[user]?.liabilities?.savedAt || null };
    }
    if (USER_TARGET_ALLOCATION[user]) {
      out[user].targetAllocation = loadTargetAllocation(user);
    }
    if (USER_GOALS[user]) {
      out[user].goals = loadGoals(user);
    }
    out[user].netWorth = assetsTotal - liabilitiesTotal;
    out[user].assetsTotal = assetsTotal;
    out[user].history = cache.history?.[user] || [];
    if (assetsTotal > 0) upsertHistorySnapshot(user, assetsTotal, investedTotal);
  }
  res.json({ users: out });
}));

async function manualRates() {
  const [eurInr, usdInr] = await Promise.all([fetchEurInr(), fetchUsdInr()]);
  return { EUR: eurInr, USD: usdInr };
}

app.get("/api/:user/manual", wrap(async (req, res) => {
  const { user } = req.params;
  if (!USERS[user] || !USER_MANUAL[user]) return res.status(404).json({ error: "Unknown user" });
  const entries = loadManualEntries(user);
  const rates = await manualRates();
  res.json({ entries, holdings: entries.map((e) => toManualHolding(e, rates)), rates });
}));

app.post("/api/:user/manual", wrap(async (req, res) => {
  const { user } = req.params;
  if (!USERS[user] || !USER_MANUAL[user]) return res.status(404).json({ error: "Unknown user" });
  const { name, type, currency, value, units, unitPrice, invested, bank, interestRate, openDate, maturityDate, asOf, note } = req.body || {};
  if (!name || !(Number(value) > 0)) return res.status(400).json({ error: "name and value are required" });
  if (currency && currency !== "EUR" && currency !== "USD") return res.status(400).json({ error: "currency must be EUR or USD" });
  const entries = loadManualEntries(user);
  const entry = {
    id: crypto.randomUUID(),
    type: MANUAL_KINDS.includes(type) ? type : "ESOP",
    name: String(name),
    currency: currency || "EUR",
    value: Number(value),
    units: units != null && units !== "" ? Number(units) : null,
    unitPrice: unitPrice != null && unitPrice !== "" ? Number(unitPrice) : null,
    invested: invested != null && invested !== "" ? Number(invested) : null,
    bank: bank || null,
    interestRate: interestRate != null && interestRate !== "" ? Number(interestRate) : null,
    openDate: openDate || null,
    maturityDate: maturityDate || null,
    asOf: asOf || null,
    note: note || null,
    addedAt: new Date().toISOString(),
  };
  entries.push(entry);
  saveManualEntries(user, entries);
  const rates = await manualRates();
  res.json({ ok: true, holding: toManualHolding(entry, rates) });
}));

app.put("/api/:user/manual/:id", wrap(async (req, res) => {
  const { user, id } = req.params;
  if (!USERS[user] || !USER_MANUAL[user]) return res.status(404).json({ error: "Unknown user" });
  const entries = loadManualEntries(user);
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return res.status(404).json({ error: "Entry not found" });
  const { name, type, currency, value, units, unitPrice, invested, bank, interestRate, openDate, maturityDate, asOf, note } = req.body || {};
  const e = entries[idx];
  entries[idx] = {
    ...e,
    ...(name != null && { name: String(name) }),
    ...(MANUAL_KINDS.includes(type) && { type }),
    ...((currency === "EUR" || currency === "USD") && { currency }),
    ...(value != null && value !== "" && { value: Number(value) }),
    ...(units != null && { units: units === "" ? null : Number(units) }),
    ...(unitPrice != null && { unitPrice: unitPrice === "" ? null : Number(unitPrice) }),
    ...(invested != null && { invested: invested === "" ? null : Number(invested) }),
    ...(bank != null && { bank: bank || null }),
    ...(interestRate != null && { interestRate: interestRate === "" ? null : Number(interestRate) }),
    ...(openDate != null && { openDate: openDate || null }),
    ...(maturityDate != null && { maturityDate: maturityDate || null }),
    ...(asOf != null && { asOf: asOf || null }),
    ...(note != null && { note: note || null }),
  };
  saveManualEntries(user, entries);
  const rates = await manualRates();
  res.json({ ok: true, holding: toManualHolding(entries[idx], rates) });
}));

app.delete("/api/:user/manual/:id", wrap(async (req, res) => {
  const { user, id } = req.params;
  if (!USERS[user] || !USER_MANUAL[user]) return res.status(404).json({ error: "Unknown user" });
  const entries = loadManualEntries(user).filter((e) => e.id !== id);
  saveManualEntries(user, entries);
  res.json({ ok: true });
}));

// ─── Liabilities — loans, credit cards, anything owed. INR-native. ───
app.post("/api/:user/liabilities", wrap(async (req, res) => {
  const { user } = req.params;
  if (!USERS[user] || !USER_LIABILITIES[user]) return res.status(404).json({ error: "Unknown user" });
  const { name, amount, type, rate, note } = req.body || {};
  if (!name || !(Number(amount) > 0)) return res.status(400).json({ error: "name and amount are required" });
  const entries = loadLiabilities(user);
  const entry = {
    id: crypto.randomUUID(),
    name: String(name),
    amount: Number(amount),
    type: type || null,
    rate: rate != null && rate !== "" ? Number(rate) : null,
    note: note || null,
    addedAt: new Date().toISOString(),
  };
  entries.push(entry);
  saveLiabilities(user, entries);
  res.json({ ok: true, entry });
}));

app.put("/api/:user/liabilities/:id", wrap(async (req, res) => {
  const { user, id } = req.params;
  if (!USERS[user] || !USER_LIABILITIES[user]) return res.status(404).json({ error: "Unknown user" });
  const entries = loadLiabilities(user);
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return res.status(404).json({ error: "Entry not found" });
  const { name, amount, type, rate, note } = req.body || {};
  entries[idx] = {
    ...entries[idx],
    ...(name != null && { name: String(name) }),
    ...(amount != null && amount !== "" && { amount: Number(amount) }),
    ...(type != null && { type: type || null }),
    ...(rate != null && { rate: rate === "" ? null : Number(rate) }),
    ...(note != null && { note: note || null }),
  };
  saveLiabilities(user, entries);
  res.json({ ok: true, entry: entries[idx] });
}));

app.delete("/api/:user/liabilities/:id", wrap(async (req, res) => {
  const { user, id } = req.params;
  if (!USERS[user] || !USER_LIABILITIES[user]) return res.status(404).json({ error: "Unknown user" });
  const entries = loadLiabilities(user).filter((e) => e.id !== id);
  saveLiabilities(user, entries);
  res.json({ ok: true });
}));

// ─── Target allocation — one object of {assetClassKey: targetPct} ───
app.put("/api/:user/target-allocation", wrap(async (req, res) => {
  const { user } = req.params;
  if (!USERS[user] || !USER_TARGET_ALLOCATION[user]) return res.status(404).json({ error: "Unknown user" });
  const targets = req.body?.targets;
  if (!targets || typeof targets !== "object") return res.status(400).json({ error: "targets object required" });
  const clean = {};
  for (const [k, v] of Object.entries(targets)) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) clean[k] = n;
  }
  saveTargetAllocation(user, clean);
  res.json({ ok: true, targets: clean });
}));

// ─── Named goals — house, education, retirement... each with its own target ───
app.post("/api/:user/goals", wrap(async (req, res) => {
  const { user } = req.params;
  if (!USERS[user] || !USER_GOALS[user]) return res.status(404).json({ error: "Unknown user" });
  const { name, targetAmount, targetDate, currentAmount, monthlyContribution, expectedReturn, note } = req.body || {};
  if (!name || !(Number(targetAmount) > 0) || !targetDate) {
    return res.status(400).json({ error: "name, targetAmount and targetDate are required" });
  }
  const entries = loadGoals(user);
  const entry = {
    id: crypto.randomUUID(),
    name: String(name),
    targetAmount: Number(targetAmount),
    targetDate: String(targetDate),
    currentAmount: currentAmount != null && currentAmount !== "" ? Number(currentAmount) : 0,
    monthlyContribution: monthlyContribution != null && monthlyContribution !== "" ? Number(monthlyContribution) : 0,
    expectedReturn: expectedReturn != null && expectedReturn !== "" ? Number(expectedReturn) : 10,
    note: note || null,
    addedAt: new Date().toISOString(),
  };
  entries.push(entry);
  saveGoals(user, entries);
  res.json({ ok: true, entry });
}));

app.put("/api/:user/goals/:id", wrap(async (req, res) => {
  const { user, id } = req.params;
  if (!USERS[user] || !USER_GOALS[user]) return res.status(404).json({ error: "Unknown user" });
  const entries = loadGoals(user);
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return res.status(404).json({ error: "Entry not found" });
  const { name, targetAmount, targetDate, currentAmount, monthlyContribution, expectedReturn, note } = req.body || {};
  entries[idx] = {
    ...entries[idx],
    ...(name != null && { name: String(name) }),
    ...(targetAmount != null && targetAmount !== "" && { targetAmount: Number(targetAmount) }),
    ...(targetDate != null && targetDate !== "" && { targetDate: String(targetDate) }),
    ...(currentAmount != null && { currentAmount: currentAmount === "" ? 0 : Number(currentAmount) }),
    ...(monthlyContribution != null && { monthlyContribution: monthlyContribution === "" ? 0 : Number(monthlyContribution) }),
    ...(expectedReturn != null && expectedReturn !== "" && { expectedReturn: Number(expectedReturn) }),
    ...(note != null && { note: note || null }),
  };
  saveGoals(user, entries);
  res.json({ ok: true, entry: entries[idx] });
}));

app.delete("/api/:user/goals/:id", wrap(async (req, res) => {
  const { user, id } = req.params;
  if (!USERS[user] || !USER_GOALS[user]) return res.status(404).json({ error: "Unknown user" });
  const entries = loadGoals(user).filter((e) => e.id !== id);
  saveGoals(user, entries);
  res.json({ ok: true });
}));

// Pull the latest cache JSON from Google Drive and replace the local cache
// with it — used by the manual refresh button in the UI.
app.post("/api/drive/refresh", wrap(async (_req, res) => {
  const remote = await loadFromDrive();
  if (!remote) return res.status(502).json({ error: "Could not load cache from Google Drive" });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(remote, null, 2));
  res.json({ ok: true });
}));

app.post("/api/:user/:broker/connect", wrap(async (req, res) => {
  const { user, broker } = req.params;
  const s = getSession(user, broker);
  if (!s) return res.status(404).json({ error: "Unknown user or broker" });

  try {
    // Any non-throwing result is the answer — including a null loginUrl,
    // which means the broker confirmed the session is already authenticated
    // (e.g. Kite's login tool on a Re-auth click). Only an actual throw
    // means auth is genuinely required and the generic OAuth flow below
    // should be attempted.
    const result = await s.beginLogin();
    return res.json({ ...result, tools: s.tools.map((t) => t.name) });
  } catch (e) {
    if (!String(e?.message).includes("invalid_token") &&
        !String(e?.message).includes("Authentication required") &&
        !String(e?.message).includes("Access token required") &&
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

    // Truthifi returns USD values — convert to INR before saving.
    if (broker === "truthifi" && data.holdings?.length) {
      const usdInr = await fetchUsdInr();
      const ACCOUNT_LABELS = {}; // accountId → label derived from securityType/account
      for (const h of data.holdings) {
        if (h.current)  h.current  = parseFloat((h.current  * usdInr).toFixed(2));
        if (h.invested) h.invested = parseFloat((h.invested * usdInr).toFixed(2));
        if (h.unitPrice) h.unitPrice = parseFloat((h.unitPrice * usdInr).toFixed(2));
        if (h.pnl)          h.pnl          = (h.current||0) - (h.invested||0);
        if (h.absoluteReturn !== undefined) h.absoluteReturn = h.pnl;
        h.absoluteReturnPct = h.invested ? (h.pnl / h.invested) * 100 : null;
        h.pnlPct = h.absoluteReturnPct;
        h.assetType = "US_401K";
        h.exchange  = "USD";
        h.usdInr    = usdInr;
      }
      data.usdInr = usdInr;
    }

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

// Fetch current USD/INR rate from Yahoo Finance (cached 5 min).
let _usdInrCache = null;
async function fetchUsdInr() {
  if (_usdInrCache && Date.now() - _usdInrCache.ts < 5 * 60 * 1000) return _usdInrCache.rate;
  try {
    const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/USDINR=X?interval=1d&range=1d",
      { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } });
    const d = await r.json();
    const rate = d?.chart?.result?.[0]?.meta?.regularMarketPrice || 84;
    _usdInrCache = { rate, ts: Date.now() };
    return rate;
  } catch { return _usdInrCache?.rate || 84; }
}

// Fetch current EUR/INR rate from Yahoo Finance (cached 5 min) — used to
// live-convert manually-entered EUR assets (e.g. a foreign ESOP account).
let _eurInrCache = null;
async function fetchEurInr() {
  if (_eurInrCache && Date.now() - _eurInrCache.ts < 5 * 60 * 1000) return _eurInrCache.rate;
  try {
    const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/EURINR=X?interval=1d&range=1d",
      { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } });
    const d = await r.json();
    const rate = d?.chart?.result?.[0]?.meta?.regularMarketPrice || 90;
    _eurInrCache = { rate, ts: Date.now() };
    return rate;
  } catch { return _eurInrCache?.rate || 90; }
}

// 1-year trailing return for Nifty 50 / S&P 500 (cached 5 min) — an honest
// caveat applies: this is a fixed trailing window, while portfolio return is
// "since cost basis" per holding, so the periods aren't perfectly aligned.
let _benchmarkCache = null;
async function fetchBenchmarks() {
  if (_benchmarkCache && Date.now() - _benchmarkCache.ts < 5 * 60 * 1000) return _benchmarkCache.data;
  const symbols = { nifty50: { sym: "%5ENSEI", label: "Nifty 50" }, sp500: { sym: "%5EGSPC", label: "S&P 500" } };
  const data = {};
  for (const [key, { sym, label }] of Object.entries(symbols)) {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1y`,
        { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } });
      const d = await r.json();
      const result = d?.chart?.result?.[0];
      const closes = (result?.indicators?.quote?.[0]?.close || []).filter((c) => c != null);
      const first = closes[0];
      const last = result?.meta?.regularMarketPrice ?? closes[closes.length - 1];
      data[key] = (first && last) ? { label, returnPct: ((last - first) / first) * 100 } : null;
    } catch { data[key] = null; }
  }
  _benchmarkCache = { data, ts: Date.now() };
  return data;
}

app.get("/api/benchmarks", wrap(async (_req, res) => {
  res.json(await fetchBenchmarks());
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

const server = app.listen(PORT, async () => {
  console.log(`\n  Wealth Trajectory running →  http://localhost:${PORT}\n`);
  console.log("  Users: " + Object.values(USERS).map(u => u.label).join(", "));
  console.log("  Brokers: " + Object.keys(BROKERS).join(", "));

  // On startup: if local cache is missing or empty, pull from Google Drive.
  const local = loadCache();
  const hasData = Object.keys(local).some(k => ["rajanish","aswini"].includes(k));
  if (!hasData) {
    console.log("  Local cache empty — fetching from Google Drive...");
    const remote = await loadFromDrive();
    if (remote) {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(remote, null, 2));
      console.log("  Cache restored from Drive ✓");
    }
  } else {
    console.log("  Local cache found — skipping Drive fetch.");
  }
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
