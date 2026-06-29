/**
 * Crossdeck AI — MCP Apps (rendered UI).
 *
 * Two `ui://` HTML resources + two app tools that return data and link to
 * them. Hosts that support MCP Apps render the chart/dashboard in a sandboxed
 * iframe (the HTML reads `structuredContent` from the tool result and the host
 * theme from `hostContext.styles.variables`); other hosts get the text fallback.
 *
 * Uses the first-class @modelcontextprotocol/ext-apps helpers
 * (registerAppResource / registerAppTool / RESOURCE_MIME_TYPE).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ToolContext } from "./tools.js";
import { resolveProject } from "./session.js";

const projectArg = z.string().optional().describe("The app to read (its project id, from list_projects). Required with a workspace key unless set via use_project.");

const UI_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "ui");
function html(name: string): string {
  try {
    return fs.readFileSync(path.join(UI_DIR, name), "utf8");
  } catch {
    return "<!doctype html><meta charset=utf-8><body style='font:14px system-ui;padding:16px'>Crossdeck UI unavailable.</body>";
  }
}

async function fetchData(
  ctx: ToolContext,
  p: string,
  params: Record<string, string | number | undefined>,
): Promise<{ data?: unknown; error?: string }> {
  const token = ctx.getToken();
  if (!token || !token.startsWith("cd_")) return { error: "Not connected to Crossdeck — authorize the connector." };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
  try {
    const res = await fetch(`${ctx.apiBase}${p}${qs.toString() ? `?${qs}` : ""}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const body = (await res.json().catch(() => ({}))) as { data?: unknown; error?: { message?: string } };
    if (!res.ok) return { error: body.error?.message ?? `Crossdeck request failed (${res.status}).` };
    return { data: body.data ?? body };
  } catch {
    return { error: `Could not reach Crossdeck (${ctx.apiBase}).` };
  }
}

const RO = { readOnlyHint: true } as const;
const GROWTH_URI = "ui://crossdeck/user-growth";
const MOAT_URI = "ui://crossdeck/moat-dashboard";

export function registerCrossdeckUi(server: McpServer, ctx: ToolContext): void {
  // ── User-growth chart ──────────────────────────────────────────────────
  registerAppResource(server, GROWTH_URI, GROWTH_URI, { mimeType: RESOURCE_MIME_TYPE }, async () => ({
    contents: [{ uri: GROWTH_URI, mimeType: RESOURCE_MIME_TYPE, text: html("user-growth.html") }],
  }));

  registerAppTool(
    server,
    "draw_user_growth",
    {
      title: "Draw user growth over time",
      description:
        "Render an interactive line chart of unique visitors and page views over time for a host you own. Use when asked to chart, graph, draw, or visualize growth or traffic for a subdomain. The host must be a verified origin of your project.",
      inputSchema: {
        project: projectArg,
        host: z.string().min(1).describe("The host, e.g. 'wes.example.com'."),
        days: z.number().int().min(1).max(90).optional().describe("Window in days (default 30)."),
      },
      _meta: { ui: { resourceUri: GROWTH_URI } },
      annotations: RO,
    },
    async ({ project, host, days }) => {
      const r = await fetchData(ctx, "/v1/reporting/metrics", { project: resolveProject(project), host, granularity: "day", days: days ?? 30 });
      if (r.error) return { content: [{ type: "text" as const, text: r.error }], isError: true };
      const d = (r.data ?? {}) as { totals?: { uniqueVisitors?: number; views?: number } };
      const t = d.totals ?? {};
      return {
        content: [{ type: "text" as const, text: `User growth for ${host}: ${t.uniqueVisitors ?? 0} unique visitors, ${t.views ?? 0} page views over the range.` }],
        structuredContent: d as Record<string, unknown>,
      };
    },
  );

  // ── Cross-layer customer dashboard (the moat, rendered) ────────────────
  registerAppResource(server, MOAT_URI, MOAT_URI, { mimeType: RESOURCE_MIME_TYPE }, async () => ({
    contents: [{ uri: MOAT_URI, mimeType: RESOURCE_MIME_TYPE, text: html("moat-dashboard.html") }],
  }));

  registerAppTool(
    server,
    "open_moat_dashboard",
    {
      title: "Open the cross-layer dashboard",
      description:
        "Render a customer's cross-layer dashboard — what they pay, their active entitlements, and their database read-cost, joined by identity. Identify the customer by any of userId, anonymousId, customerId, or a rail transaction id.",
      inputSchema: {
        project: projectArg,
        userId: z.string().optional(),
        anonymousId: z.string().optional(),
        customerId: z.string().optional(),
        appleOriginalTransactionId: z.string().optional(),
        googlePurchaseToken: z.string().optional(),
        stripeCustomerId: z.string().optional(),
      },
      _meta: { ui: { resourceUri: MOAT_URI } },
      annotations: RO,
    },
    async ({ project, ...args }) => {
      if (!Object.values(args).some(Boolean)) {
        return { content: [{ type: "text" as const, text: "Identify the customer with at least one of: userId, anonymousId, customerId, appleOriginalTransactionId, googlePurchaseToken, stripeCustomerId." }], isError: true };
      }
      const r = await fetchData(ctx, "/v1/crossmatch", { project: resolveProject(project), ...args });
      if (r.error) return { content: [{ type: "text" as const, text: r.error }], isError: true };
      const d = (r.data ?? {}) as { revenue?: { monthlyCents?: number }; entitlements?: { active?: number }; readCost?: { reads?: number; windowDays?: number } };
      const rev = d.revenue ?? {};
      const ent = d.entitlements ?? {};
      const rc = d.readCost;
      const summary = d.revenue || d.readCost
        ? `Pays ${rev.monthlyCents != null ? "$" + (rev.monthlyCents / 100).toFixed(2) : "—"}/mo, ${ent.active ?? 0} entitlements${rc ? `, ${rc.reads} reads / ${rc.windowDays}d` : ""}.`
        : "No customer matched that identifier.";
      return { content: [{ type: "text" as const, text: summary }], structuredContent: (d ?? {}) as Record<string, unknown> };
    },
  );
}
