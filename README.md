# Wealth Trajectory — independent broker dashboard

A self-contained portfolio dashboard that talks to your brokers' **MCP servers
directly through its own backend**. No Anthropic in the loop, no API key, no
chat step. You run it, you own it.

```
Browser (dashboard)  ──►  this Node server  ──►  mcp.kite.trade / INDmoney MCP
                            (MCP client +            (your data, OAuth-gated)
                             OAuth session,
                             serves the page too)
```

The browser only ever talks to **your** server, and your server talks to the
brokers. That one design choice removes the wall that makes a browser-only
version impossible: brokers don't allow cross-origin (CORS) calls from random
web pages, and their session tokens must live server-side.

## What you still have to do once: log in to the broker

Reading your holdings requires you to authenticate with the broker — that's
OAuth, and it's the security model, not a limitation. You enter your
credentials/OTP **on the broker's own page**, never here. After that, this
server holds the authenticated MCP session and the dashboard just reads from it.

## Requirements

- Node.js 18 or newer
- A Zerodha and/or INDmoney account

## Run

```bash
cd wealth-trajectory
npm install
npm start
```

Open **http://localhost:8787**.

## Using it

1. Click **Connect** on a broker card. A broker login tab opens.
2. Log in / approve on the broker's page, then come back.
3. Click **Load**. Holdings, totals, allocation, and the FIRE trajectory fill in.
4. The **Data** tab shows the raw MCP tools your account exposes — useful if a
   number looks off (see below).

## Tabs

- **Overview** — live net worth, invested, unrealised gain, % toward independence.
- **Holdings** — per-broker positions.
- **Allocation** — donut by holding.
- **Trajectory** — FIRE calculator (pure client-side math), seeded with your live corpus.
- **Data** — call any broker MCP tool directly and inspect the JSON.

## If a number looks wrong

MCP servers don't share one fixed vocabulary, so `mcp.js` matches tools and
fields by intent (anything containing `holding`, `portfolio`, `networth`, etc.).
Zerodha returns standard Kite Connect holding fields, which map cleanly. For
other brokers the field names may differ.

To fix: open the **Data** tab, click the relevant tool, read the real field
names in the JSON, and adjust the `HOLDING_HINTS` / field lists near the top of
`mcp.js`. Restart, reload. That's the only place that ever needs tuning.

## Known caveats

- **INDmoney auth.** Its MCP server uses OAuth 2.1 + PKCE. If the simple
  login-tool flow here doesn't complete for your account, the server may require
  a full OAuth redirect handled by the MCP SDK's `authProvider`. The Kite hosted
  endpoint uses a login-link flow that this code handles directly. The
  `INDMONEY_MCP_URL` is configurable in `.env` if the endpoint differs.
- **Single user.** Sessions are kept in memory and global. Fine for running it
  for yourself; for a multi-user deployment you'd key sessions per logged-in user.
- **Read-only.** Both brokers' hosted MCP servers are read-only — no trades, no
  transfers. This app never attempts a write.

## Deploy (optional)

It's a normal Node app — host it anywhere that runs Node (a small VM, Render,
Fly.io, Railway, etc.). Put it behind HTTPS and add your own login in front of
it before exposing it publicly, since anyone who reaches it could trigger a
broker connect. For personal use, running it locally is the simplest and safest.

## Files

- `server.js` — Express server: serves the dashboard + `/api/*` endpoints.
- `mcp.js` — the MCP client: connects to brokers, logs in, discovers tools, normalises holdings.
- `public/index.html` — the dashboard (React via CDN, no build step).
- `.env.example` — optional overrides.
