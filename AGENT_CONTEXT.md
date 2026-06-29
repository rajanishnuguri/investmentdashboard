# Wealth Trajectory — Agent Handoff Context

## What this project is

A self-hosted investment dashboard that pulls portfolio data from Indian broker MCP servers (Zerodha Kite, INDmoney) and displays net worth, holdings, allocation, returns, and a FIRE trajectory calculator.

**Key design principle:** Everything runs on the user's own server. The browser talks only to `localhost:8787`. That server talks to the brokers. No data goes to Anthropic or any third party.

---

## How to run

```bash
npm install
node server.js
# Opens at http://localhost:8787
```

Server compiles `src/app.jsx` → `public/vendor/app.js` at startup using `@babel/core` (server-side, not browser Babel). If JSX is edited, restart the server or run:

```bash
node -e "
const babel=require('@babel/core'),fs=require('fs');
const {code}=babel.transformSync(fs.readFileSync('src/app.jsx','utf8'),{presets:[['@babel/preset-react',{runtime:'classic'}]],filename:'app.jsx'});
fs.writeFileSync('public/vendor/app.js',code);
console.log('Built, size:',code.length);
"
```

**Always commit `public/vendor/app.js`** — it is not in `.gitignore`.

---

## File map

| File | Purpose |
|---|---|
| `server.js` | Express server, all `/api/*` routes, price refresh logic |
| `mcp.js` | MCP client (`BrokerSession`), holding normalisation (`mapHolding`) |
| `oauth.js` | OAuth 2.0 + PKCE flow for INDmoney (dynamic client registration) |
| `src/app.jsx` | Full React frontend (JSX source) |
| `public/vendor/app.js` | Compiled output — commit after every JSX change |
| `public/index.html` | Shell HTML — loads all vendor JS/CSS from `/vendor/` |
| `public/vendor/` | Bundled deps: React 18, ReactDOM, react-is, prop-types, Recharts 2.12.7, Tailwind CSS |
| `.portfolio-cache.json` | Last fetched portfolio — gitignored, lives only on user's machine |
| `tailwind.config.js` | Scans `public/index.html` for Tailwind classes, used to generate `tailwind.css` |

---

## Brokers

| Key | Label | MCP URL | Auth method |
|---|---|---|---|
| `kite` | Zerodha · Kite | `https://mcp.kite.trade/mcp` | Login tool in MCP (returns OAuth URL) |
| `indmoney` | INDmoney | `https://mcp.indmoney.com/mcp` | OAuth 2.0 + PKCE via `oauth.js` |

Both can be overridden via env vars `KITE_MCP_URL` / `INDMONEY_MCP_URL`.

---

## API routes

| Method | Path | What it does |
|---|---|---|
| GET | `/api/status` | Returns connection state + cached holdings for all brokers |
| POST | `/api/:broker/connect` | Starts broker login; returns `loginUrl` to open in browser |
| GET | `/api/:broker/callback` | OAuth callback for INDmoney; exchanges code for token |
| GET | `/api/:broker/portfolio` | Fetches live holdings; falls back to cache on session expiry |
| GET | `/api/:broker/tools` | Lists MCP tools exposed by broker |
| POST | `/api/:broker/tool` | Calls any MCP tool by name (used in Data tab) |
| POST | `/api/:broker/disconnect` | Closes MCP session |
| POST | `/api/prices/refresh` | Refreshes live prices without re-auth (see below) |

---

## Real-time price refresh (`POST /api/prices/refresh`)

No broker re-authentication needed. Reads from `.portfolio-cache.json`, updates prices, writes back.

| Asset type | Source | Method |
|---|---|---|
| MF | [mfapi.in](https://api.mfapi.in) (free, no auth) | Try `investment_code` as AMFI scheme code → fallback name search |
| US stocks / ETFs / REITs | Yahoo Finance | Name search → ticker → USD price × live USD/INR rate |
| Indian equities (NSE/BSE) | Yahoo Finance | `SYMBOL.NS` direct → fallback name search |
| EPF / PPF / NPS / Bond | — | Skipped (no live market price) |

Prices cached in memory for 5 minutes. USD/INR rate fetched once per refresh via `USDINR=X` on Yahoo Finance.

---

## INDmoney specifics

- MCP server is **auth-gated** — `listTools` fails with `invalid_token` before login. `ensureClient()` catches this and stores the error; `beginLogin()` extracts the OAuth URL from the error message.
- Asset types fetched: `MF`, `US_STOCK`, `PPF`, `EPF`, `NPS`, `BOND` — **`IND_STOCK` is excluded** to avoid double-counting with Kite.
- `networth_holdings` tool requires an `asset_type` argument — one call is made per asset type.
- `xirr` field always comes back as `0` (not calculated by INDmoney) — treated as `null` in `mapHolding`.
- EPF/PPF/NPS holdings display as just "EPF", "PPF", "NPS" — employer/provider names suppressed.

### INDmoney field mapping (important)
| INDmoney field | Normalised field |
|---|---|
| `investment` | `symbol` |
| `investment_code` | `investmentCode` |
| `invested_amount` | `invested` |
| `market_value` | `current` |
| `total_pnl` | `absoluteReturn` / `pnl` |
| `pnl_per` | `pnlPct` / `absoluteReturnPct` |
| `total_units` | `quantity` |
| `unit_price` | `unitPrice` |
| `assetclass_l2` | `assetType` (fallback) |

---

## Kite (Zerodha) specifics

- Standard Kite Connect holding objects: `tradingsymbol`, `exchange` (NSE/BSE), `quantity`, `average_price`, `last_price`, `pnl`.
- Already returns live prices at fetch time — `last_price` is real-time.
- No `asset_type` field; classified as Indian Equity via `exchange === "NSE" || "BSE"` in the frontend.

---

## Normalised holding shape (from `mapHolding` in `mcp.js`)

```js
{
  symbol,           // display name / ticker
  exchange,         // NSE / BSE / MF / US_STOCK / etc.
  assetType,        // MF / US_STOCK / EPF / PPF / NPS / BOND / ""
  broker,           // broker name string from raw data
  investmentCode,   // INDmoney investment_code (used for mfapi.in lookup)
  unitPrice,        // current price per unit (INR)
  quantity,         // number of units/shares
  invested,         // total cost basis (INR)
  current,          // current market value (INR)
  pnl,              // absolute P&L (INR)
  pnlPct,           // P&L % (from broker or derived)
  absoluteReturn,   // same as pnl
  absoluteReturnPct,
  dividendEarned,   // null for most INDmoney assets
  totalReturn,      // pnl + dividends
  totalReturnPct,
  xirr,             // null if broker returns 0
  benchmarkXirr,    // null for all current brokers
  cagr,             // null for all current brokers
}
```

---

## Frontend architecture (`src/app.jsx`)

Single-file React app, no bundler. Uses React 18 globals (`React`, `ReactDOM`, `Recharts`) loaded from `/vendor/`.

### Key components

| Component | What it renders |
|---|---|
| `App` | Root; owns all state, tab routing |
| `BrokerCard` | Connect / Load buttons + status per broker |
| `Overview` | Hero net worth, asset class breakdown bars |
| `Holdings` | Grouped by asset class, collapsible, table layout, refresh button |
| `HoldingGroup` | One asset class section with subtotal row |
| `HoldingRow` | Single holding: name, units×price, invested, current, return % |
| `Allocation` | Pie chart — toggle "by asset class" or "by holding" |
| `Trajectory` | FIRE calculator with sliders + line chart |
| `DataRoom` | Raw MCP tool explorer |

### Asset class grouping (in `ASSET_GROUPS`)

```js
{ key:"eq",    label:"Indian Equities",  match: h => exchange is NSE/BSE }
{ key:"mf",    label:"Mutual Funds",     match: h => assetType === "MF" }
{ key:"us",    label:"US Stocks & ETFs", match: h => assetType === "US_STOCK" }
{ key:"fixed", label:"EPF / PPF / NPS",  match: h => assetType in [EPF,PPF,NPS] }
{ key:"bond",  label:"Bonds",            match: h => assetType === "BOND" }
```

### State

```js
brokers: { kite: {connected, authed, holdings, tools, loading, error, fromCache},
           indmoney: { ... } }
refreshedAt: ISO string — last price refresh timestamp
refreshing: boolean
a: FIRE assumptions object
```

### `api` object (all fetch calls)

```js
api.status()           // GET /api/status
api.connect(broker)    // POST /api/:broker/connect
api.portfolio(broker)  // GET /api/:broker/portfolio
api.callTool(b,n,args) // POST /api/:broker/tool
api.refreshPrices()    // POST /api/prices/refresh
```

---

## Vendor dependencies (all local, no CDN)

| File | Library |
|---|---|
| `react.production.min.js` | React 18 |
| `react-dom.production.min.js` | ReactDOM 18 |
| `react-is.production.min.js` | react-is (Recharts peer dep) |
| `prop-types.min.js` | prop-types (Recharts peer dep) |
| `Recharts.js` | Recharts 2.12.7 UMD |
| `tailwind.css` | Pre-generated Tailwind v3 CSS |

---

## Known issues / limitations

- Yahoo Finance search can occasionally pick the wrong ticker for uncommon fund names — check the `tickerMap` in memory if a US stock price looks wrong.
- INDmoney `xirr`, `cagr`, `benchmarkXirr` all return null — INDmoney doesn't expose these in `networth_holdings`.
- No dividend data from INDmoney for any asset type.
- Sessions are in-memory — server restart requires re-authenticating brokers.
- Cache file (`.portfolio-cache.json`) is single-user; for multi-user, key sessions by user ID.
- Port default is `8787`; override with `PORT` env var.

---

## Git branch / push convention

- **Always push to `main`** (user's explicit instruction).
- After any JSX change: rebuild `public/vendor/app.js` before committing.
- `.portfolio-cache.json` is gitignored — never commit it.

---

## Things that would be good to add next

- Auto-refresh prices on a timer (every 15–30 min while tab is open)
- Historical portfolio value chart (store daily snapshots in a separate JSON file)
- Individual stock detail view — 1D/1W/1M/1Y price chart via Yahoo Finance
- Kite intraday quote support (Kite MCP has a `quote` tool)
- Tax P&L view — short-term vs long-term gains
- SIP tracker — investment schedule vs actual
- Export to CSV / PDF
