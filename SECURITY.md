# Security

Prism is the AI/MCP surface over Crossdeck's bank-grade outbound-read spine. This document is
written for a security reviewer evaluating whether to connect Prism into a trusted environment.

## Reporting a vulnerability

Email **security@cross-deck.com** with details and reproduction steps. Please do not open a
public issue for security reports. We aim to acknowledge within two business days.

## Trust model

- **The credential is the boundary, not the data.** A connected client is fully trusted to read
  the owner's own data — exactly what the owner already sees on the Crossdeck dashboard. The risk
  surface is the *credential*, so the credential is scoped, short-lived, and stood guard around.

## Authentication & authorization

- **OAuth 2.1 with PKCE (S256 only).** The token endpoint advertises
  `code_challenge_methods_supported: ["S256"]` and `token_endpoint_auth_methods_supported:
  ["none"]` — public-client PKCE, no client secret in the flow.
- **Dynamic Client Registration (RFC 7591)** and **authorization-server / protected-resource
  discovery (RFC 8414 / RFC 9728)** — standards-based, so first-party clients (Claude, ChatGPT,
  Cursor) connect without manual setup.
- **Short-lived workspace credentials.** A successful flow mints a workspace credential
  (`cd_wk_…`) with a **1-hour** access-token TTL, plus a refresh token (30-day) with **one-time-use
  rotation and reuse detection** (a replayed refresh token revokes the whole token family).
- **Redirect-URI allow-listing.** Exact per-client redirect URIs, loopback (`127.0.0.1` /
  `localhost`) per RFC 8252, and known platform hosts (`claude.ai`, `chatgpt.com`, `cursor.com`)
  over HTTPS only.
- **Issuer binding (RFC 9207).** The authorization response carries `iss`.

## Authorization scope

- A resolved token maps to a single owner (a Firebase uid) and **only that owner's projects** —
  it cannot read another tenant's data.
- The caller selects a project explicitly per call (multi-app by design); a single-project secret
  key ignores the project parameter and is bound to its one project.
- **Fail-closed.** A missing, expired, or invalid token returns an actionable `401` with
  connection instructions — never silent or partial data.

## Data handling

- **Read-only.** Every tool is annotated `readOnlyHint: true`. There are no write or
  configuration-mutating tools in this surface.
- **Minimised identifiers.** Identity-joined answers return the owner's *own* identifiers
  (the developer's user ids) and facts (monthly revenue, entitlement counts, read-cost) — never
  emails or names the owner did not themselves provide.
- **Scoped origins.** Per-host analytics require the host to be a **verified origin** of the
  project; an unverified host is rejected.
- **No local/conversation access.** Prism reads only the owner's Crossdeck project data via the
  API. It does not read conversation history or local files.

## Operational posture

- **No read monster.** Every tool is a point-read of a maintained ledger — querying through Prism
  does not scan and does not run up the owner's database bill.
- **Rate-limited & audited.** Outbound reads pass the same gate as the rest of Crossdeck's
  outbound API: per-key rate limits and an access log.
- **Transport.** Remote: Streamable HTTP over TLS at `https://api.cross-deck.com/mcp`. Local: the
  `@cross-deck/ai` stdio server, which sends a server-side secret key you control to the same API.

## Further reading

- Outbound-API security spine: https://cross-deck.com/docs/outbound-api-security/
- Privacy policy: https://cross-deck.com/legal/privacy/
