// mcp.js
// A thin wrapper around the official MCP SDK that acts as an MCP *client*
// to remote broker MCP servers (Zerodha Kite, INDmoney, ...).
//
// This is the piece that makes the site "independent": the broker conversation
// happens here, server-side, over the MCP Streamable-HTTP transport. The browser
// never talks to the broker directly (so no CORS), and nothing routes through
// Anthropic. The only thing the user still does is log in on the broker's own
// page once — that's OAuth, and there is no way around it (nor should there be).

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const URL_RE = /(https?:\/\/[^\s"'<>)\]]+)/g;

// Tool-name heuristics. MCP servers don't share a fixed vocabulary, so we match
// by intent. After you connect, the Tools tab shows the real names for your
// account — tweak these arrays if your broker uses different ones.
const LOGIN_HINTS = ["login", "authorize", "authorise", "auth", "connect", "session"];
const HOLDING_HINTS = [
  "holding", "portfolio", "networth", "net_worth", "net-worth",
  "position", "mutual", "mf", "mf_holdings", "investment", "summary",
];

// Asset types to fetch from INDmoney. IND_STOCK is intentionally excluded —
// Indian equity is already pulled from Kite/Zerodha to avoid double-counting.
const INDMONEY_ASSET_TYPES = ["MF", "US_STOCK", "PPF", "EPF", "NPS", "BOND"];

// Expand a tool name into one or more {name, args, label} calls.
// Some tools (e.g. INDmoney's networth_holdings) need a required argument.
function toolCalls(name, brokerKey) {
  if (name === "networth_holdings") {
    const types = brokerKey === "indmoney" ? INDMONEY_ASSET_TYPES : ["IND_STOCK", "MF", "US_STOCK", "BOND", "ETF"];
    return types.map((t) => ({
      name,
      args: { asset_type: t },
      label: `${name}:${t}`,
    }));
  }
  return [{ name, args: {}, label: name }];
}

function pickTool(tools, hints) {
  const names = tools.map((t) => t.name);
  // exact-ish first
  for (const h of hints) {
    const hit = names.find((n) => n.toLowerCase() === h);
    if (hit) return hit;
  }
  // then substring
  for (const h of hints) {
    const hit = names.find((n) => n.toLowerCase().includes(h));
    if (hit) return hit;
  }
  return null;
}

function textOf(result) {
  if (!result || !Array.isArray(result.content)) return "";
  return result.content
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n");
}

function tryJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { /* not json */ }
  // some servers wrap json in prose or code fences — try to salvage
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* ignore */ } }
  const brace = text.match(/[[{][\s\S]*[\]}]/);
  if (brace) { try { return JSON.parse(brace[0]); } catch { /* ignore */ } }
  return null;
}

function findLoginUrl(text) {
  if (!text) return null;
  const m = text.match(URL_RE);
  if (!m) return null;
  // prefer a broker auth-looking url
  return (
    m.find((u) => /login|auth|connect|oauth|kite|consent/i.test(u)) || m[0]
  );
}

// One live connection to one broker's MCP server.
export class BrokerSession {
  constructor(key, url, clientInfo) {
    this.key = key;
    this.url = url;
    this.clientInfo = clientInfo || { name: "wealth-trajectory", version: "1.0.0" };
    this.client = null;
    this.transport = null;
    this.tools = [];
    this.authed = false;
    this.loginUrl = null;
    this.lastError = null;
  }

  get connected() {
    return !!this.client;
  }

  async ensureClient() {
    if (this.client) return;
    const headers = this.accessToken
      ? { Authorization: `Bearer ${this.accessToken}` }
      : {};
    this.transport = new StreamableHTTPClientTransport(new URL(this.url), { requestInit: { headers } });
    this.client = new Client(this.clientInfo, { capabilities: {} });
    await this.client.connect(this.transport);
    try {
      const listed = await this.client.listTools();
      this.tools = listed.tools || [];
    } catch (e) {
      // Some servers (e.g. INDmoney) require auth before they expose tools.
      // Store the error and let beginLogin() handle it.
      this.listToolsError = String(e?.message || e);
    }
  }

  // Called after OAuth completes. Reconnects the MCP client with the bearer token.
  async setAuthToken(accessToken) {
    this.accessToken = accessToken;
    // Close existing unauthenticated connection so ensureClient() reconnects.
    try { await this.client?.close?.(); } catch { /* ignore */ }
    this.client = null;
    this.transport = null;
    this.listToolsError = null;
    await this.ensureClient();
    this.authed = this.tools.length > 0;
  }

  // Kick off the broker login. Returns a URL the user must open to authenticate.
  // After they finish on the broker page, the same MCP session is authorised,
  // so later tool calls on this same BrokerSession succeed.
  async beginLogin() {
    await this.ensureClient();

    // Server requires auth before listing tools — extract login URL from the error.
    if (this.listToolsError) {
      const url = findLoginUrl(this.listToolsError) || this._oauthLoginUrl();
      if (url) {
        this.loginUrl = url;
        return { loginUrl: url, note: "Auth required before tools are visible." };
      }
      throw new Error(`Server requires auth but no login URL found. Error: ${this.listToolsError}`);
    }

    const loginTool = pickTool(this.tools, LOGIN_HINTS);
    if (!loginTool) {
      // No explicit login tool. Either the server auths via OAuth-redirect at the
      // transport level, or it's already open. Probe a data tool to see.
      const probe = pickTool(this.tools, HOLDING_HINTS);
      if (probe) {
        try {
          const r = await this.client.callTool({ name: probe, arguments: {} });
          const url = findLoginUrl(textOf(r));
          if (url) { this.loginUrl = url; return { loginUrl: url, tool: probe }; }
          this.authed = true;
          return { loginUrl: null, tool: probe, note: "No login step required." };
        } catch (e) {
          this.lastError = String(e?.message || e);
          throw new Error(
            `No login tool found and probe failed (${this.lastError}). ` +
            `This broker may require an OAuth redirect flow — see README.`
          );
        }
      }
      throw new Error("No login or portfolio tool exposed by this server.");
    }
    const res = await this.client.callTool({ name: loginTool, arguments: {} });
    const url = findLoginUrl(textOf(res));
    this.loginUrl = url;
    if (!url) {
      // Some servers say "already logged in" instead of returning a URL
      this.authed = true;
    }
    return { loginUrl: url, tool: loginTool };
  }

  // Pull whatever portfolio/holdings tools exist and return raw + best-effort
  // normalised holdings.
  async fetchPortfolio() {
    await this.ensureClient();
    // If tools were unavailable at connect time (auth-gated), retry now —
    // the user may have just completed OAuth in the browser.
    if (this.tools.length === 0) await this.refreshToolsAfterAuth();

    const wanted = this.tools
      .map((t) => t.name)
      .filter((n) => HOLDING_HINTS.some((h) => n.toLowerCase().includes(h)));

    if (wanted.length === 0) {
      return { raw: {}, holdings: [], tools: this.tools.map((t) => t.name) };
    }

    const raw = {};
    let needsLogin = null;
    // Build a list of {name, args} calls — some tools need specific arguments.
    const calls = wanted.flatMap((name) => toolCalls(name, this.key));
    for (const { name, args, label } of calls) {
      try {
        const r = await this.client.callTool({ name, arguments: args || {} });
        const text = textOf(r);
        const url = findLoginUrl(text);
        if (url && /login|auth|consent|sign.?in/i.test(text)) {
          needsLogin = url;
          continue;
        }
        raw[label || name] = tryJson(text) ?? text;
      } catch (e) {
        raw[label || name] = { error: String(e?.message || e) };
      }
    }
    if (needsLogin) {
      this.loginUrl = needsLogin;
      const err = new Error("LOGIN_REQUIRED");
      err.loginUrl = needsLogin;
      throw err;
    }
    this.authed = true;
    const holdings = normaliseHoldings(raw);
    return { raw, holdings, tools: this.tools.map((t) => t.name) };
  }

  async callTool(name, args) {
    await this.ensureClient();
    const r = await this.client.callTool({ name, arguments: args || {} });
    const text = textOf(r);
    return { text, json: tryJson(text), isError: !!r.isError };
  }

  // Derive a probable OAuth login URL from the MCP server's base URL.
  // INDmoney's MCP URL is https://mcp.indmoney.com/mcp — their login page is
  // at the same origin. This is a best-effort fallback when the error message
  // contains no URL.
  _oauthLoginUrl() {
    try {
      const u = new URL(this.url);
      return `${u.origin}/login`;
    } catch { return null; }
  }

  // After the user completes OAuth in the browser, the existing MCP session
  // becomes authorised. Re-fetch the tool list so portfolio calls can proceed.
  async refreshToolsAfterAuth() {
    if (!this.client) return;
    try {
      const listed = await this.client.listTools();
      this.tools = listed.tools || [];
      this.listToolsError = null;
    } catch (e) {
      this.lastError = String(e?.message || e);
    }
  }

  async close() {
    try { await this.client?.close?.(); } catch { /* ignore */ }
    this.client = null;
    this.transport = null;
    this.authed = false;
    this.listToolsError = null;
  }
}

// Best-effort mapping of MCP tool output into a uniform holding shape the
// dashboard understands. Zerodha Kite returns standard Kite Connect holding
// objects (tradingsymbol / quantity / average_price / last_price / pnl), which
// we map precisely. For other shapes we make a reasonable guess and otherwise
// leave the raw object visible in the Data tab.
function normaliseHoldings(raw) {
  const out = [];
  for (const [tool, value] of Object.entries(raw)) {
    const arr = asArray(value);
    for (const row of arr) {
      const h = mapHolding(row);
      if (h) { h.source = tool; out.push(h); }
    }
  }
  return out;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    // common containers: { holdings: [...] } / { data: [...] } / { net: [...] }
    for (const k of ["holdings", "data", "positions", "net", "items", "results", "stocks", "funds", "bonds", "instruments"]) {
      if (Array.isArray(value[k])) return value[k];
    }
  }
  return [];
}

const num = (v) => {
  const n = typeof v === "string" ? parseFloat(v.replace(/[^0-9.\-]/g, "")) : v;
  return Number.isFinite(n) ? n : 0;
};
const firstKey = (o, keys) => keys.find((k) => o[k] != null);

function mapHolding(row) {
  if (!row || typeof row !== "object") return null;
  const symKey = firstKey(row, [
    "tradingsymbol", "symbol", "ticker", "investment", "name", "scheme_name",
    "fund_name", "scheme", "instrument", "stock_name",
  ]);
  if (!symKey) return null;

  const qty = num(row[firstKey(row, ["quantity", "qty", "units", "total_units", "unit_count"]) ?? ""] ?? 0);
  const avg = num(row[firstKey(row, ["average_price", "avg_price", "avgPrice", "buy_price", "nav_buy", "avg_nav"]) ?? ""] ?? 0);
  const last = num(row[firstKey(row, ["last_price", "ltp", "current_price", "lastPrice", "nav", "current_nav", "unit_price"]) ?? ""] ?? 0);

  let invested = num(row[firstKey(row, ["invested", "invested_value", "invested_amount", "cost", "buy_value"]) ?? ""] ?? 0);
  let current = num(row[firstKey(row, ["current", "current_value", "market_value", "value", "current_amount"]) ?? ""] ?? 0);
  if (!invested && qty && avg) invested = qty * avg;
  if (!current && qty && last) current = qty * last;

  let pnl = num(row[firstKey(row, ["pnl", "profit", "gain", "unrealised", "unrealized", "total_pnl", "absolute_pnl"]) ?? ""] ?? 0);
  if (!pnl && (current || invested)) pnl = current - invested;

  const absoluteReturn = pnl;
  const absoluteReturnPct = invested ? (pnl / invested) * 100 : null;

  // Return metrics — populated when the broker provides them
  const xirrRaw     = numOrNull(row[firstKey(row, ["xirr", "irr"]) ?? ""]);
  const xirr        = xirrRaw === 0 ? null : xirrRaw;
  const benchmarkXirr = numOrNull(row[firstKey(row, ["benchmark_xirr", "benchmark_irr", "benchmark_returns"]) ?? ""]);
  const cagr        = numOrNull(row[firstKey(row, ["cagr", "annualised_return", "annualized_return"]) ?? ""]);
  const dividendEarned = num(row[firstKey(row, ["dividend_earned", "dividends", "dividend_amount", "dividend"]) ?? ""] ?? 0);
  const totalReturn = pnl + dividendEarned;
  const totalReturnPct = invested ? (totalReturn / invested) * 100 : null;

  // pnl_per from INDmoney is already absolute-return % when invested_amount is unknown
  const pnlPct = numOrNull(row[firstKey(row, ["pnl_percentage", "pnl_pct", "pnl_percent", "pnl_per", "returns_pct"]) ?? ""])
    ?? absoluteReturnPct;

  const assetType = row.asset_type || row.assetclass_l2 || "";
  // For EPF/PPF/NPS, suppress company-level names — just show the scheme type.
  const symbol = ["EPF", "PPF", "NPS"].includes(row.asset_type)
    ? row.asset_type
    : String(row[symKey]);

  return {
    symbol,
    exchange:     row.exchange || row.exchange_segment || row.segment || row.asset_type || "",
    assetType,
    broker:       row.broker || "",
    quantity:     qty || null,
    invested:     invested || null,
    current:      current || (invested + pnl) || null,
    // P&L
    pnl:          absoluteReturn,
    pnlPct,
    absoluteReturn,
    absoluteReturnPct,
    // Dividends
    dividendEarned: dividendEarned || null,
    totalReturn:    totalReturn || null,
    totalReturnPct,
    returnWithDividends:    totalReturnPct,
    returnWithoutDividends: absoluteReturnPct,
    // Annualised metrics
    xirr,
    benchmarkXirr,
    cagr,
  };
}

const numOrNull = (v) => {
  if (v == null || v === "" || v === "unknown") return null;
  const n = typeof v === "string" ? parseFloat(v.replace(/[^0-9.\-]/g, "")) : v;
  return Number.isFinite(n) ? n : null;
};
