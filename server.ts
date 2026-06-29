#!/usr/bin/env node
/**
 * Crossdeck AI — MCP server (tools).
 *
 * The product is "Crossdeck understands your app." This server exposes
 * cross-layer, job-oriented tools over Prism (Crossdeck's intelligence layer). Crossdeck owns
 * identity, revenue, entitlements, errors, analytics, and read-cost about an
 * app's users, and joins them BY IDENTITY — so a single tool can answer a
 * question that crosses layers (who an error affected AND how many of them
 * pay you), which no single-layer tool can.
 *
 * Directory-grade tool metadata: every tool has a `title` and a `readOnlyHint`
 * annotation; all tools are read-only (no read/write mixing); descriptions are
 * narrow, accurate, and non-promotional; outputs are scoped and paginated;
 * errors are actionable. Logs go to stderr (stdout is the MCP wire).
 *
 * Transport: stdio here (local/dev — Claude Desktop, Cursor, Claude Code with
 * a secret key in env). The directory build wraps these same tools in a
 * Streamable-HTTP + OAuth host (see http.ts / CROSSDECK_AI_MCP_SUBMISSION.md);
 * the tool layer is shared.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { registerCrossdeckTools } from "./tools.js";
import { registerCrossdeckUi } from "./ui.js";

const VERSION = "0.3.1";
const SECRET_KEY = process.env.CROSSDECK_SECRET_KEY ?? "";
const API_BASE = process.env.CROSSDECK_API_BASE ?? "https://api.cross-deck.com";

function log(msg: string): void {
  process.stderr.write(`[crossdeck-ai] ${msg}\n`);
}

const server = new McpServer({ name: "crossdeck-ai", version: VERSION });

// The stdio build authenticates with a secret key from the environment; the
// tool layer takes an auth resolver so the HTTP/OAuth build can swap in a
// per-request token without touching the tools.
const toolCtx = { apiBase: API_BASE, getToken: () => SECRET_KEY };
registerCrossdeckTools(server, toolCtx);
registerCrossdeckUi(server, toolCtx);

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
  log(`Crossdeck AI v${VERSION} ready (api: ${API_BASE}, key: ${SECRET_KEY ? "set" : "MISSING — set CROSSDECK_SECRET_KEY"})`);
}

main().catch((e) => {
  log(`fatal: ${String(e)}`);
  process.exit(1);
});

export { z };
