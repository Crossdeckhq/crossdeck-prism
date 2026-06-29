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
 * narrow/non-promotional description that states WHAT IT RETURNS, WHEN TO USE it,
 * and its EDGE CASES, scoped + paginated output, actionable errors. The moat is
 * shown by CAPABILITY (cross-layer answers), never by promotional language.
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
const projectArg = z.string().optional().describe("The app to read, as a project id from list_projects (e.g. 'proj_3a8f137bccdd4f'). With a workspace key (cd_wk_) this is required unless you've set a default via use_project; with a single-app key it is ignored.");

export function registerCrossdeckTools(server: McpServer, ctx: ToolContext): void {
  // ── Portfolio: list + select the app (multi-app is the default) ──────────────
  server.registerTool(
    "list_projects",
    {
      title: "List your apps",
      description:
        "List every app (project) in your Crossdeck portfolio that this connector can read — the same set your Pulse dashboard shows. Returns an array of { id, name } per app. Call this FIRST when a workspace key (cd_wk_) is connected, then pass an id to other tools or set a default with use_project. With a single-app key it returns just that one app. Read-only; takes no arguments.",
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
        "Set the current app for this conversation so later tools default to it without repeating `project`. Behaves as session state: it persists until you call this again and applies to every subsequent tool call. Returns { currentProject } — the project id now in effect. Use when the user says 'switch to <app>' or names an app to focus on; call list_projects first for valid ids. No effect with a single-app key (the project is fixed).",
      inputSchema: { project: z.string().min(1).describe("The project id to make current, copied from list_projects (e.g. 'proj_3a8f137bccdd4f').") },
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
        "Get an app's recurring revenue from its maintained revenue ledger (a point-read, never a scan). Returns MRR in cents, the paying-customer count, and the per-rail split across Stripe, Apple, and Google; with granularity='day' it adds a daily time series over the window. Use for 'what's our MRR', 'how many paying customers', or revenue-trend questions. An app with no revenue yet returns zeros, not an error.",
      inputSchema: {
        project: projectArg,
        granularity: z.enum(["total", "day"]).optional().describe("How to aggregate: 'total' (default) = the latest snapshot; 'day' = a daily time series across the window."),
        days: z.number().int().min(1).max(366).optional().describe("Only with granularity='day': the trend window in days (1–366, default 90)."),
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
        "Get an app's database read-cost over the last `days` days, split into per-user reads vs un-attributed overhead, plus a breakdown by operation. Per-user attribution works because Crossdeck joins read-cost to the SDK's identity, so you can see which operations drive the bill. Returns the per-user-vs-overhead totals and the by-operation breakdown. Use for 'what's driving our database reads' or 'which operation costs the most'.",
      inputSchema: { project: projectArg, days: z.number().int().min(1).max(90).optional().describe("Look-back window in days (1–90, default 30).") },
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
        "For one error (by fingerprint/issue id), get its blast radius joined to identity. Returns distinct users affected, how many of those are PAYING customers, and the error's type, status, occurrence count, and first/last-seen timestamps — counts only. Use to size an error's impact. For the NAMED paying users behind the counts (and their revenue at risk), call get_error_affected_users instead.",
      inputSchema: { project: projectArg, fingerprint: z.string().min(1).describe("The error's fingerprint / issue id from the Crossdeck Errors view (e.g. 'a1b2c3').") },
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
        "For one error (by fingerprint), get the PAYING users it actually hit — the row-level moat answer: which paying customer broke, and how much are they worth. Returns a list sorted by revenue at risk (highest first), each row with your own user id, monthly revenue in cents, and when they last hit the error. Joins the error layer to identity and revenue. Returns only your own identifiers — never emails or names you didn't provide. Use when you need the actual customers, not just the counts from get_error_impact.",
      inputSchema: {
        project: projectArg,
        fingerprint: z.string().min(1).describe("The error's fingerprint / issue id (e.g. 'a1b2c3')."),
        limit: z.number().int().min(1).max(100).optional().describe("Max users to return (1–100, default 25), highest revenue-at-risk first."),
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
        "Cross-match one customer across every layer Crossdeck joins by identity. Returns what they pay (monthly cents), their active entitlement count, and their database read-cost — in one view. Identify the person by ANY ONE of the identifiers below; they all resolve to the same canonical customer. Use for 'how much does this user pay and what do they cost us?'. If no customer resolves, returns a no-match result, not an error.",
      inputSchema: {
        project: projectArg,
        userId: z.string().optional().describe("Your own user id for this person — the value you pass to identify() in the SDK (e.g. 'user_847')."),
        anonymousId: z.string().optional().describe("A pre-login anonymous/device id captured before the user signed in."),
        customerId: z.string().optional().describe("A Crossdeck customer id ('cdcust_…')."),
        appleOriginalTransactionId: z.string().optional().describe("Apple StoreKit originalTransactionId for the customer's purchase."),
        googlePurchaseToken: z.string().optional().describe("Google Play purchase token for the customer's purchase."),
        stripeCustomerId: z.string().optional().describe("Stripe customer id ('cus_…')."),
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
        "Get headless web analytics for one host/subdomain the app owns (e.g. a tenant's subdomain). Returns page views and unique visitors with totals; granularity='day' adds a daily series. The host MUST be a verified origin of the project, or the request is rejected (403). Use for per-tenant or per-subdomain traffic questions.",
      inputSchema: {
        project: projectArg,
        host: z.string().min(1).describe("The host to read, e.g. 'wes.example.com'. Must be a verified origin of the selected app."),
        granularity: z.enum(["total", "day"]).optional().describe("'total' (default) for totals only, or 'day' for a daily series."),
        days: z.number().int().min(1).max(90).optional().describe("Look-back window in days (1–90, default 30)."),
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
        "Get the top pages or top referrers for one host the app owns, ranked and paginated. Returns rows of { key, views } highest-first, where `key` is a page path (default) or a referrer. Set dimension='top_referrers' for traffic sources. The host must belong to the selected app. Use for 'most-viewed pages on this subdomain' or 'where its traffic comes from'.",
      inputSchema: {
        project: projectArg,
        host: z.string().min(1).describe("The host to read, e.g. 'wes.example.com'. Must belong to the selected app."),
        dimension: z.enum(["top_pages", "top_referrers"]).optional().describe("What to rank: 'top_pages' (default) or 'top_referrers'."),
        days: z.number().int().min(1).max(90).optional().describe("Look-back window in days (1–90, default 30)."),
        limit: z.number().int().min(1).max(100).optional().describe("Max rows to return (1–100, default 25), highest-first."),
      },
      annotations: RO,
    },
    async ({ project, host, dimension, days, limit }) => cdGet(ctx, "/v1/reporting/breakdown", { project: resolveProject(project), host, dimension, days, limit }),
  );
}
