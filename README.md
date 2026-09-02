<div align="center">

# Prism — Crossdeck's intelligence layer for AI

**Ask your app anything — revenue, errors, database read-cost, growth — in plain English, and get rendered charts and dashboards back.**

[![npm version](https://img.shields.io/npm/v/@cross-deck/ai?color=ff6e45&label=%40cross-deck%2Fai)](https://www.npmjs.com/package/@cross-deck/ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![MCP](https://img.shields.io/badge/Model_Context_Protocol-2025--06--18-111)](https://modelcontextprotocol.io)
[![OAuth 2.1](https://img.shields.io/badge/Auth-OAuth_2.1_%E2%80%A2_PKCE-2ea44f.svg)](#security)
[![Read-only](https://img.shields.io/badge/Tools-read--only-2ea44f.svg)](#tools)

*"Which paying customer did this crash hit, and how much revenue is at risk?" — one question, answered across error, identity, and revenue. No single-layer tool can do that.*

[**What Prism does →**](https://cross-deck.com/prism/) · [Developer docs](https://cross-deck.com/docs/prism/) · [Crossdeck](https://cross-deck.com)

</div>

---

## Why Prism is different

Most MCP servers are a connector to *one* system. **Prism is an intelligence layer over your whole app** — because Crossdeck already joins the layers about your users (**identity · revenue · entitlements · errors · analytics · database read-cost**) into one source of truth, *by identity*.

The point isn't "let AI read my data." It's **the crossing**: one question can span layers no other tool joins —

> *"This error `a1b2c3` — who did it hit, and how many of them pay us?"*
> → the named paying users behind the crash, each with their monthly revenue at risk, sorted by what's on the line.

That's the moat sentence. Prism gives it a voice in Claude, ChatGPT, Cursor, or any MCP client.

---

## Permissions & data access

**Secure, read-only access to your live Crossdeck workspace.** Prism reads; it never writes.

**Prism can see** (the layers Crossdeck already owns about your app):

| | |
|---|---|
| 💷 **Revenue** | MRR, paying-customer counts, per-rail split |
| 🐛 **Errors** | issues, blast radius, who was affected |
| 📈 **Analytics** | per-host page views, unique visitors, top pages/referrers |
| 🗄️ **Read-cost** | per-user-vs-overhead database reads, by operation |
| 🧭 **Customer journeys** | the cross-layer view of one customer (pay × entitlements × cost) |

Row-level **customer identity** is returned only when your connection was explicitly granted that scope — otherwise Prism answers from aggregates and tells you so. That boundary is enforced by Crossdeck, not left to the model.

**Prism cannot** create, modify, delete, or configure anything in your projects. There is no write path — every tool is read-only (`readOnlyHint: true`). Ask it to change something and it will tell you it can't.

Data is fetched live at question time over an OAuth-protected endpoint; the connector stores nothing.

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

No install step — `npx` fetches the package **and its dependencies** on each launch, so it
self-heals and stays current (nothing local to go stale):

```json
{
  "mcpServers": {
    "crossdeck": {
      "command": "npx",
      "args": ["-y", "@cross-deck/ai"],
      "env": { "CROSSDECK_SECRET_KEY": "cd_sk_live_…" }
    }
  }
}
```

Use a **secret** key (`cd_sk_`) from your dashboard → API keys — never a publishable (`cd_pub_`) one. `CROSSDECK_API_BASE` overrides the endpoint (e.g. sandbox).

> **If the connector shows "failed" / "Server disconnected" — two known causes, both fixable:**
>
> 1. **`spawn npx ENOENT` / command not found.** Desktop clients launch with a *minimal*
>    PATH that often excludes your Node bin (common with `nvm`). Fix: use the **absolute
>    path** to `npx` as `command` — run `which npx` and paste the full path (e.g.
>    `/Users/you/.nvm/versions/node/vX/bin/npx`).
> 2. **`ERR_MODULE_NOT_FOUND … @modelcontextprotocol/sdk`.** This only happens if `args`
>    points at a **hand-built local checkout** (`…/dist/server.js`) — that folder's
>    `node_modules` can be cleaned out from under you (e.g. anything under `/tmp`). Fix:
>    **never point at a local build.** Let `npx -y @cross-deck/ai` (above) resolve the
>    published package, so its dependencies are always present.
>
> Simplest of all: use the **remote connector** at the top of this section — it runs no
> local Node at all, so neither failure can occur.

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

---

## Tools

Thirteen tools — all **read-only** (`readOnlyHint`), each with a human-readable `title`, scoped/paginated output, and actionable errors. Every read is a point-read of a maintained ledger, so **asking questions never runs up your database bill.**

Every number is **self-describing**: values come back with a `meta.semantics` briefing and a `coverage` state, so a metric is reported as exactly what it is, and a blind spot (`not_instrumented`) is never mistaken for a real zero.

**Portfolio**
- `list_projects` — list every app this connector can read (your portfolio).
- `get_portfolio` — the coverage map: for each app, which surfaces are instrumented vs a blind spot. Load it first so a later blank reads as a known blind spot, not a fact.
- `use_project` — set the current app for subsequent tools ("switch to <app>").

**Revenue & cost**
- `get_revenue` — MRR, paying-customer count, per-rail split (Stripe/Apple/Google), optional daily trend.
- `get_customers` — the customer census: the paying-customer count (plus total / active where instrumented). The canonical "how many customers does this app have" answer.
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
