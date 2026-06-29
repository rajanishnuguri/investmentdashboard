// oauth.js
// Server-side OAuth 2.0 Authorization Code + PKCE flow for MCP brokers
// that require auth before listing tools (e.g. INDmoney).

import crypto from "crypto";

function base64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function generatePKCE() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

// Fetch OAuth server metadata from the well-known endpoint.
async function fetchMetadata(mcpUrl) {
  const origin = new URL(mcpUrl).origin;
  const r = await fetch(`${origin}/.well-known/oauth-authorization-server`);
  if (!r.ok) throw new Error(`OAuth metadata fetch failed: ${r.status}`);
  return r.json();
}

// Dynamically register a client if the server supports it.
async function registerClient(registrationEndpoint, callbackUrl) {
  const r = await fetch(registrationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Wealth Trajectory",
      redirect_uris: [callbackUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Client registration failed: ${r.status} ${text}`);
  }
  return r.json();
}

// Exchange auth code for tokens.
async function exchangeCode({ tokenEndpoint, clientId, code, verifier, callbackUrl }) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl,
    client_id: clientId,
    code_verifier: verifier,
  });
  const r = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Token exchange failed: ${r.status} ${text}`);
  }
  return r.json(); // { access_token, refresh_token, expires_in, ... }
}

// Pending OAuth states keyed by `state` param.
const pending = new Map();

// Begin the OAuth flow. Returns the URL to send the user to.
export async function beginOAuth(mcpUrl, callbackUrl) {
  const meta = await fetchMetadata(mcpUrl);
  const { verifier, challenge } = generatePKCE();
  const state = base64url(crypto.randomBytes(16));

  let clientId;
  if (meta.registration_endpoint) {
    const reg = await registerClient(meta.registration_endpoint, callbackUrl);
    clientId = reg.client_id;
  } else {
    throw new Error("OAuth server does not support dynamic client registration.");
  }

  pending.set(state, { verifier, clientId, meta, mcpUrl });

  const url = new URL(meta.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("scope", (meta.scopes_supported || []).join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  return { loginUrl: url.toString(), state };
}

// Complete the OAuth flow after the callback. Returns { access_token, ... }.
export async function completeOAuth(code, state, callbackUrl) {
  const p = pending.get(state);
  if (!p) throw new Error("Unknown or expired OAuth state.");
  pending.delete(state);

  const tokens = await exchangeCode({
    tokenEndpoint: p.meta.token_endpoint,
    clientId: p.clientId,
    code,
    verifier: p.verifier,
    callbackUrl,
  });
  return { tokens, mcpUrl: p.mcpUrl };
}
