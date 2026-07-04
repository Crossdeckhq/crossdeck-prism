# Changelog

All notable changes to **Prism** (`@cross-deck/ai`) — Crossdeck's intelligence layer for AI.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This package follows [SemVer](https://semver.org/).

## [0.4.0] — 2026-07-04

The moat-surfaces release. First published cut of the 0.3.4 work below (which was staged but never published) **plus** the Phase-2 moat tools. `npm` goes 0.3.3 → 0.4.0.

### Changed
- **`get_revenue` now answers MRR-over-time.** With `granularity='day'` it returns a daily MRR time series (`data.series`) — pass `days` (e.g. `56` for 8 weeks) to size the window and ask *"is my MRR up or down?"* or *"MRR history"*. Now wired on the remote (ChatGPT) path too, not just the npx build.

### Added
- **`get_revenue_averages`** — ARPU and average lifetime value. Answers *"average lifetime value per user for biotree"* and *"what's my ARPU"* from maintained ledgers (point-reads, no scan): avg MRR per paying customer, and recognised revenue to date ÷ paying customers. Clearly framed as averages across the paying base — never one customer's pay (`get_customer` for that).
- **`get_acquisition`** — signups by first-touch source. Answers *"what's my biggest signup source?"* with new customers grouped by their **true** acquisition source — the referrer/utm on their earliest anonymous visit (e.g. `chatgpt.com`, `google`), carried forward to the customer at signup, not the signup-moment referrer. Forward-only, `not_instrumented` until attributed signups accrue.
- **`list_customers_ranked`** — the moat leaderboard. Pivot the whole customer book by an axis Crossdeck owns and rank it: *"which paying customers cost me the most in database reads?"* (`by=read_cost`) or by monthly revenue (`by=mrr`), filtered by `segment`. Each row joins your own user id, monthly revenue, and read-cost by identity — the cross-layer question no single-layer tool can answer. `not_instrumented` where read-cost isn't wired, never a misleading empty ranking.

## [0.3.4] — 2026-07-04

The "every number tells the truth" release — plus two new tools and directory-review polish.

### Fixed
- **Rendered charts now display inside ChatGPT.** The `draw_user_growth` and `open_moat_dashboard` widgets declared no Content-Security-Policy, so ChatGPT's Apps sandbox showed a "CSP off" badge and blocked their inline chart script — nothing drew. Each widget resource now declares its CSP in `_meta.ui.csp` (and the legacy `openai/widgetCSP` alias): the widgets are fully self-contained (inline SVG + `postMessage`, no external fetch), so connect domains are empty and only OpenAI's own static host is allowed. Charts render in the sandbox.

### Added
- **`get_customers`** — the customer census: the paying-customer count (plus total / active people where instrumented). Ask *"how many customers does this app have?"* and get the answer from the right source, not an estimate.
- **`get_portfolio`** — a coverage map of your whole workspace: for each app, which surfaces are instrumented (revenue · read-cost · analytics · customer census) vs a blind spot. Load it first and every later number is interpreted against a known map.

### Changed
- **Self-describing numbers ("No Bare Numbers").** Every value now returns with a `meta.semantics` briefing (what it is, what it is *not*, its authority) and a `coverage` state. A metric is reported as exactly what it measures — an actor count is never mistaken for a user count.
- **A blind spot is never a zero.** Where a surface isn't wired for an app, tools return `not_instrumented` (with an explanation), never a misleading `0`. Read-cost, revenue, and the census all distinguish a real measured zero from "not set up yet".
- **Permission boundaries, spoken.** If a workspace hasn't granted customer-identity access, Prism says so and offers the aggregate path (revenue / errors / analytics / read-cost) instead of failing — the boundary is enforced, and useful.
- **Clearer tool guidance.** Descriptions are tighter and cross-pointed (e.g. read-cost points you to `get_revenue`/`get_customers` for real customer counts), and the connector separates retrieved facts from AI interpretation.

### Docs
- New **"Permissions & data access"** section: secure, read-only, live; the exact data Prism can see; and that Prism **cannot** modify your projects.

## [0.3.x] — earlier

The connector's foundation, shipped over the 0.3 line:

- **One-click remote connect** — a hosted, OAuth 2.1 + PKCE endpoint at `https://api.cross-deck.com/mcp`; short-lived, scoped workspace credentials, nothing long-lived to paste. Plus a local stdio option via `npx @cross-deck/ai` with a secret key.
- **The cross-layer tools** — revenue, read-cost, errors, analytics, and the moat: *"which paying customer did this crash hit, and how much revenue is at risk?"* — one question answered across error, identity, and revenue.
- **Rendered MCP Apps UI** — interactive growth charts and a customer cross-layer dashboard inline in capable hosts, with a text fallback elsewhere.
- **Read-only by design** — every tool is `readOnlyHint: true`; there is no write path. Built on Crossdeck's bank-grade outbound-read security spine.

[0.3.4]: https://www.npmjs.com/package/@cross-deck/ai
