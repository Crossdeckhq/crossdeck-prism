/**
 * Crossdeck AI — the shared tool layer.
 *
 * Registered identically by the stdio build (server.ts) and the
 * Streamable-HTTP + OAuth build (http.ts). Auth is injected via `getToken`
 * so the transport owns credentials, not the tools.
 *
 * MULTI-APP BY DEFAULT. Crossdeck's whole promise is the portfolio ("every app,
 * one live map"). With a WORKSPACE key (cd_wk_) the connector sees every app the
 * owner owns and switches between them in conversation: `list_projects` to
 * enumerate, `use_project` to set the current one (or pass `project` per call).
 * A single-project secret key (cd_sk_) still works — `project` is simply ignored.
 *
 * Every tool: directory-grade metadata (`title` ≤64, `readOnlyHint`), read-only,
 * narrow/non-promotional description, scoped + paginated output, actionable
 * errors. The moat is shown by CAPABILITY (cross-layer answers), never by
 * promotional language.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolveProject, setCurrentProject, getCurrentProject } from "./session.js";

export interface ToolContext {
  apiBase: string;
  /** Returns the bearer token for the current caller (env key for stdio,
   *  OAuth access token for HTTP). Empty string ⇒ unauthenticated. */
  getToken: () => string;
}

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
};

function ok(data: unknown): ToolResult {
  const obj = (data && typeof data === "object" ? data : { value: data }) as Record<string, unknown>;
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: obj };
}
function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** One scoped GET against Prism (the read API behind the connector). Surfaces the API's typed error
 *  envelope to the model as an actionable message (never a bare 500/400). */
async function cdGet(
  ctx: ToolContext,
  path: string,
  params: Record<string, string | number | undefined>,
): Promise<ToolResult> {
  const token = ctx.getToken();
  if (!token || !token.startsWith("cd_")) {
    return fail(
      "Not connected to Crossdeck. Authorize the connector (or, for the local build, set CROSSDECK_SECRET_KEY to a cd_sk_ project key or a cd_wk_ workspace key from your Crossdeck dashboard → API keys).",
    );
  }
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
  const url = `${ctx.apiBase}${path}${qs.toString() ? `?${qs}` : ""}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    const body = (await res.json().catch(() => ({}))) as { data?: unknown; meta?: unknown; error?: { code?: string; message?: string } };
    if (!res.ok) {
      if (res.status === 429) return fail(`Crossdeck rate limit reached. Wait briefly and retry. ${body.error?.message ?? ""}`.trim());
      if (res.status === 401) return fail("Crossdeck rejected the credentials — reconnect the connector.");
      if (res.status === 403) return fail(`Not permitted: ${body.error?.message ?? "this resource is outside your scope."}`);
      if (body.error?.code === "missing_required_param" && body.error?.message?.includes("project")) {
        return fail("Which app? With a workspace key you must pick a project. Call list_projects, then use_project (or pass `project`).");
      }
      return fail(`Crossdeck API ${res.status} ${body.error?.code ?? ""}: ${body.error?.message ?? "request failed"}`.trim());
    }
    return ok({ data: body.data ?? body, meta: body.meta });
  } catch {
    return fail(`Could not reach Crossdeck (${ctx.apiBase}). Check connectivity and retry.`);
  }
}

const RO = { readOnlyHint: true } as const;
const projectArg = z.string().optional().describe("The app to read (its project id, from list_projects). With a workspace key this is required unless you've set one via use_project; with a single-app key it's ignored.");

export function registerCrossdeckTools(server: McpServer, ctx: ToolContext): void {
  // ── Portfolio: list + select the app (multi-app is the default) ──────────────
  server.registerTool(
    "list_projects",
    {
      title: "List your apps",
      description:
        "List every app (project) this connector can read — your portfolio, the same set your Pulse dashboard shows. Use this first when you have more than one app, then use_project to pick one. Requires a workspace key (cd_wk_).",
      inputSchema: {},
      annotations: RO,
    },
    async () => cdGet(ctx, "/v1/workspace/projects", {}),
  );

  server.registerTool(
    "use_project",
    {
      title: "Select the current app",
      description:
        "Set the app that subsequent tools read by default, by its project id (from list_projects). Saying 'switch to <app>' should call this. Returns the now-current project.",
      inputSchema: { project: z.string().min(1).describe("The project id to make current (from list_projects).") },
      annotations: RO,
    },
    async ({ project }) => {
      setCurrentProject(project);
      return ok({ currentProject: getCurrentProject() });
    },
  );

  // ── Revenue ──────────────────────────────────────────────────────────────────
  server.registerTool(
    "get_revenue",
    {
      title: "Get revenue",
      description:
        "Get the app's current recurring revenue: MRR (cents), paying-customer count, and the per-rail split across Stripe, Apple, and Google. Pass granularity='day' with a days window for a daily trend. Use for questions about MRR, paying customers, or revenue trend.",
      inputSchema: {
        project: projectArg,
        granularity: z.enum(["total", "day"]).optional().describe("'total' (default) for the latest snapshot, or 'day' for a daily series."),
        days: z.number().int().min(1).max(366).optional().describe("With granularity='day', the trend window (default 90)."),
      },
      annotations: RO,
    },
    async ({ project, granularity, days }) => cdGet(ctx, "/v1/revenue", { project: resolveProject(project), granularity, days }),
  );

  // ── Read-cost ──────────────────────────────────────────────────────────────────
  server.registerTool(
    "get_read_cost",
    {
      title: "Get database read-cost",
      description:
        "Get the app's database read-cost split into per-user reads vs un-attributed overhead, with a breakdown by operation, over the last `days` days. Per-user attribution is possible because Crossdeck joins read-cost to the SDK's identity. Use for questions about what drives database reads or which operation costs the most.",
      inputSchema: { project: projectArg, days: z.number().int().min(1).max(90).optional().describe("Window in days (default 30).") },
      annotations: RO,
    },
    async ({ project, days }) => cdGet(ctx, "/v1/buckets", { project: resolveProject(project), days }),
  );

  // ── Errors: impact (counts) ──────────────────────────────────────────────────
  server.registerTool(
    "get_error_impact",
    {
      title: "Get an error's impact",
      description:
        "For one error (by fingerprint/issue id), get how many distinct users hit it and how many of those are PAYING customers, plus its type, status, occurrence count, and first/last seen. Counts only. For the named paying users behind those counts, use get_error_affected_users.",
      inputSchema: { project: projectArg, fingerprint: z.string().min(1).describe("The error's fingerprint / issue id from the Crossdeck Errors view.") },
      annotations: RO,
    },
    async ({ project, fingerprint }) => cdGet(ctx, "/v1/errors", { project: resolveProject(project), fingerprint }),
  );

  // ── Errors: WHO (row-level, the moat) ────────────────────────────────────────
  server.registerTool(
    "get_error_affected_users",
    {
      title: "Get who an error hit and what they pay",
      description:
        "For one error (by fingerprint), get the PAYING users it actually hit — each with your own user id, their monthly revenue (cents), and when they last hit it — sorted by revenue at risk. This is the row-level moat answer ('which paying customer broke, and how much are they worth'), joining the error to identity and revenue. Returns your own identifiers only, never emails/names you didn't provide.",
      inputSchema: {
        project: projectArg,
        fingerprint: z.string().min(1).describe("The error's fingerprint / issue id."),
        limit: z.number().int().min(1).max(100).optional().describe("Max users to return (default 25)."),
      },
      annotations: RO,
    },
    async ({ project, fingerprint, limit }) => cdGet(ctx, "/v1/errors/affected", { project: resolveProject(project), fingerprint, limit }),
  );

  // ── Customer cross-match (the moat, one person) ──────────────────────────────
  server.registerTool(
    "get_customer",
    {
      title: "Get a customer's full picture",
      description:
        "Get one customer across every layer Crossdeck joins by identity: what they pay (monthly cents), their active entitlement count, and their database read-cost. Identify them by any of: your own user id, an anonymous id, a Crossdeck customer id, or a rail transaction id. Use for 'how much does this user pay and what do they cost us?'.",
      inputSchema: {
        project: projectArg,
        userId: z.string().optional().describe("Your own user id for this person (what you pass to identify())."),
        anonymousId: z.string().optional().describe("A pre-login anonymous/device id."),
        customerId: z.string().optional().describe("A Crossdeck customer id (cdcust_…)."),
        appleOriginalTransactionId: z.string().optional().describe("Apple StoreKit originalTransactionId."),
        googlePurchaseToken: z.string().optional().describe("Google Play purchase token."),
        stripeCustomerId: z.string().optional().describe("Stripe customer id (cus_…)."),
      },
      annotations: RO,
    },
    async ({ project, ...args }) => {
      if (!args.userId && !args.anonymousId && !args.customerId && !args.appleOriginalTransactionId && !args.googlePurchaseToken && !args.stripeCustomerId) {
        return fail("Identify the customer with at least one of: userId, anonymousId, customerId, appleOriginalTransactionId, googlePurchaseToken, or stripeCustomerId.");
      }
      return cdGet(ctx, "/v1/crossmatch", { project: resolveProject(project), ...args });
    },
  );

  // ── Per-host analytics ───────────────────────────────────────────────────────
  server.registerTool(
    "get_host_analytics",
    {
      title: "Get analytics for a host",
      description:
        "Get page views and unique visitors for one host or subdomain you own (e.g. a tenant's subdomain). Pass granularity='day' for a daily series. The host must be a verified origin of your project, or the request is rejected. Use for per-tenant analytics questions.",
      inputSchema: {
        project: projectArg,
        host: z.string().min(1).describe("The host, e.g. 'wes.example.com'. Must belong to the selected app."),
        granularity: z.enum(["total", "day"]).optional().describe("'total' (default) or 'day' for a daily series."),
        days: z.number().int().min(1).max(90).optional().describe("Window in days (default 30)."),
      },
      annotations: RO,
    },
    async ({ project, host, granularity, days }) => cdGet(ctx, "/v1/reporting/metrics", { project: resolveProject(project), host, granularity, days }),
  );

  server.registerTool(
    "get_host_top_pages",
    {
      title: "Get top pages or referrers for a host",
      description:
        "Get the top pages or top referrers for one host you own, paginated via `limit`. Set dimension='top_referrers' for referrers (default is top pages). The host must belong to the selected app. Use for 'most-viewed pages on this subdomain' or 'where its traffic comes from'.",
      inputSchema: {
        project: projectArg,
        host: z.string().min(1).describe("The host, e.g. 'wes.example.com'. Must belong to the selected app."),
        dimension: z.enum(["top_pages", "top_referrers"]).optional().describe("'top_pages' (default) or 'top_referrers'."),
        days: z.number().int().min(1).max(90).optional().describe("Window in days (default 30)."),
        limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 25)."),
      },
      annotations: RO,
    },
    async ({ project, host, dimension, days, limit }) => cdGet(ctx, "/v1/reporting/breakdown", { project: resolveProject(project), host, dimension, days, limit }),
  );
}
