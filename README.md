<div align="center">

# Prism — Crossdeck's intelligence layer for AI

**Ask your app anything — revenue, errors, database read-cost, growth — in plain English, and get rendered charts and dashboards back.**

[![npm version](https://img.shields.io/npm/v/@cross-deck/ai?color=ff6e45&label=%40cross-deck%2Fai)](https://www.npmjs.com/package/@cross-deck/ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![MCP](https://img.shields.io/badge/Model_Context_Protocol-2025--06--18-111)](https://modelcontextprotocol.io)
[![OAuth 2.1](https://img.shields.io/badge/Auth-OAuth_2.1_%E2%80%A2_PKCE-2ea44f.svg)](#security)
[![Read-only](https://img.shields.io/badge/Tools-read--only-2ea44f.svg)](#tools)

*"Which paying customer did this crash hit, and how much revenue is at risk?" — one question, answered across error, identity, and revenue. No single-layer tool can do that.*

</div>

---

## Why Prism is different

Most MCP servers are a connector to *one* system. **Prism is an intelligence layer over your whole app** — because Crossdeck already joins the layers about your users (**identity · revenue · entitlements · errors · analytics · database read-cost**) into one source of truth, *by identity*.

The point isn't "let AI read my data." It's **the crossing**: one question can span layers no other tool joins —

> *"This error `a1b2c3` — who did it hit, and how many of them pay us?"*
> → the named paying users behind the crash, each with their monthly revenue at risk, sorted by what's on the line.

That's the moat sentence. Prism gives it a voice in Claude, ChatGPT, Cursor, or any MCP client.

---

## Connect in 60 seconds

### Remote (recommended) — one-click OAuth, no keys to paste

Prism is a hosted, OAuth-protected MCP endpoint:

```
https://api.cross-deck.com/mcp
```

Add it as a connector in your client, sign in with your Crossdeck account, pick a project, and approve. That's it — the client receives a short-lived, scoped workspace credential automatically.

- **Claude (web / desktop):** Settings → Connectors → Add custom connector → paste the URL above.
- **ChatGPT:** Settings → Connectors → Add → paste the URL.
- **Cursor:** Settings → MCP → Add → paste the URL.

Or open your dashboard at **app.cross-deck.com → Developers → Prism → Connect AI** for one-click "Add to Claude / ChatGPT / Cursor".

### Local (Claude Desktop / Cursor / Claude Code) — stdio + a secret key

```bash
npm install -g @cross-deck/ai
```

```json
{
  "mcpServers": {
    "crossdeck": {
      "command": "crossdeck-ai",
      "env": { "CROSSDECK_SECRET_KEY": "cd_sk_live_…" }
    }
  }
}
```

Use a **secret** key (`cd_sk_`) from your dashboard → API keys — never a publishable (`cd_pub_`) one. `CROSSDECK_API_BASE` overrides the endpoint (e.g. sandbox).

---

## Try these first

| Ask | Tool | You get |
|---|---|---|
| *"What's our MRR and paying-customer count, split by Stripe/Apple/Google?"* | `get_revenue` | MRR, paying count, three-rail split, optional daily trend |
| *"This error `a1b2c3` — who did it hit and do any of them pay us?"* | `get_error_affected_users` | The **named paying users** behind the crash, each with monthly revenue at risk |
| *"Show me everything about customer `agent_8842`."* | `open_moat_dashboard` | A **rendered dashboard**: what they pay × entitlements × read-cost, joined by identity |
| *"Draw our user growth over the last 30 days."* | `draw_user_growth` | A **rendered interactive line chart** of visitors + page views |
| *"What's driving our database reads — per-user vs overhead?"* | `get_read_cost` | The per-user-vs-overhead split + reads by operation |

Data tools return clean JSON; `draw_user_growth` and `open_moat_dashboard` render interactive charts/dashboards inline in hosts that support MCP Apps (and fall back to a text summary elsewhere).

<!-- SCREENSHOT: docs/assets/moat-dashboard.png  — the open_moat_dashboard rendered card -->
<!-- SCREENSHOT: docs/assets/user-growth.png     — the draw_user_growth rendered chart -->

---

## Tools

Eleven tools — all **read-only** (`readOnlyHint`), each with a human-readable `title`, scoped/paginated output, and actionable errors. Every read is a point-read of a maintained ledger, so **asking questions never runs up your database bill.**

**Portfolio**
- `list_projects` — list every app this connector can read (your portfolio).
- `use_project` — set the current app for subsequent tools ("switch to <app>").

**Revenue & cost**
- `get_revenue` — MRR, paying-customer count, per-rail split (Stripe/Apple/Google), optional daily trend.
- `get_read_cost` — database read-cost split into per-user reads vs un-attributed overhead, by operation.

**The moat — error × identity × revenue**
- `get_error_impact` — for one error: how many distinct users hit it, and how many are paying (counts).
- `get_error_affected_users` — the **named paying users** an error hit, each with monthly revenue and last-hit, sorted by revenue at risk. *Returns your own identifiers only — never emails/names you didn't provide.*
- `get_customer` — one customer across every layer Crossdeck joins by identity: what they pay × active entitlements × read-cost.

**Analytics**
- `get_host_analytics` — page views + unique visitors for a host/subdomain you own (optional daily series).
- `get_host_top_pages` — top pages or referrers for a host you own.

**Rendered UI (MCP Apps)**
- `draw_user_growth` — an interactive line chart of visitors + page views over time.
- `open_moat_dashboard` — a customer's cross-layer dashboard (pay × entitlements × read-cost) rendered as cards.

---

## Security

Prism is built on Crossdeck's bank-grade outbound-read spine. See [SECURITY.md](./SECURITY.md) for the full model. In short:

- **OAuth 2.1 + PKCE (S256)**, dynamic client registration, short-lived (1h) workspace credentials with refresh-token rotation and reuse detection. No long-lived secret leaves your dashboard.
- **Read-only.** Every tool is `readOnlyHint: true` — no writes, no config mutations.
- **Scoped & fail-closed.** A token resolves to one owner and their own projects; a missing/invalid token returns an actionable 401, never silent data.
- **Your data only.** Prism reads your own project's data, scoped by your token. It does **not** read your conversation history or local files, and returns your own identifiers — never PII you didn't provide.

---

## Known limitations

- **Read-only** in v1 — writes/config are a later, separately-gated stage.
- Per-host analytics require the host to be a **verified origin** of your project.
- Rendered charts require an MCP-Apps-capable host; others get a text summary.
- Reporting reflects data from when Crossdeck was connected (historical backfill is separate).

---

## Links

- **npm:** https://www.npmjs.com/package/@cross-deck/ai
- **API reference:** https://cross-deck.com/docs/reporting-api/
- **Security spine:** https://cross-deck.com/docs/outbound-api-security/
- **Privacy:** https://cross-deck.com/legal/privacy/
- **Support:** support@cross-deck.com

## License

[MIT](./LICENSE) © Crossdeck
