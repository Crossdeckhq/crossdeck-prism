# Contributing to Prism (`@cross-deck/ai`)

Thanks for your interest. This package is the MCP/AI surface over Crossdeck — a small, focused
tool layer plus two rendered MCP-Apps UIs.

## Development

```bash
npm install
npm run build      # tsc + copies ui/ into dist/
npm test           # node --test over the built tests
npm run dev        # tsc --watch
```

Run it locally against your own Crossdeck project by setting `CROSSDECK_SECRET_KEY` (a `cd_sk_`
key from your dashboard → API keys) and pointing your MCP client at the `crossdeck-ai` command.

## Principles

- **Read-only.** Every tool must be `readOnlyHint: true`, with a human-readable `title` and an
  actionable error message. No write or config-mutating tools belong in this surface.
- **No read monster.** Tools are point-reads of maintained ledgers — never scans. A new tool that
  would scan does not get added; the maintained doc gets added first.
- **The crossing is the product.** Favour tools that join layers by identity (error × revenue,
  customer × cost) over single-layer wrappers.
- Keep inputs scoped and paginated (`limit` caps); surface upstream API error codes verbatim.

## Pull requests

- Add or update a test in `src/*.test.ts` for any tool change (the suite asserts every tool's
  `title` + `readOnlyHint`).
- Keep the README tool reference in sync.
- Publishing is automated via CI on a version tag; please do not `npm publish` locally (a guard
  prevents it).

## Security

Please report vulnerabilities privately — see [SECURITY.md](./SECURITY.md). Do not open public
issues for security reports.
