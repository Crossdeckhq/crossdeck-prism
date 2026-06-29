/**
 * Integration test — spawns the built stdio server, runs the MCP handshake,
 * and asserts the directory-grade contract: tool count, hard-gate metadata
 * (title + readOnlyHint) on every tool, UI tools linked to ui:// resources,
 * the resources serve the MCP-Apps mime, and unauthenticated calls fail
 * closed with an actionable error. Run: `npm run build && npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), "server.js");

/** Send a batch of JSON-RPC lines to a fresh server and collect responses by id. */
function rpc(requests: object[], env: Record<string, string> = {}): Promise<Map<number, any>> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], { env: { ...process.env, CROSSDECK_SECRET_KEY: "cd_sk_test", ...env }, stdio: ["pipe", "pipe", "ignore"] });
    let buf = "";
    const out = new Map<number, any>();
    const timer = setTimeout(() => { child.kill(); reject(new Error("timeout")); }, 8000);
    child.stdout.on("data", (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        try { const m = JSON.parse(line); if (m.id != null) out.set(m.id, m); } catch { /* ignore */ }
      }
      if (out.size >= requests.filter((r: any) => r.id != null).length) { clearTimeout(timer); child.kill(); resolve(out); }
    });
    child.on("error", reject);
    for (const r of requests) child.stdin.write(JSON.stringify(r) + "\n");
  });
}

const INIT = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } } };
const INITED = { jsonrpc: "2.0", method: "notifications/initialized" };

test("every tool has title + readOnlyHint (hard gate)", async () => {
  const r = await rpc([INIT, INITED, { jsonrpc: "2.0", id: 2, method: "tools/list" }]);
  const tools = r.get(2).result.tools as any[];
  // 8 data/UI tools + list_projects + use_project + get_error_affected_users (0.3.0 multi-app).
  assert.equal(tools.length, 11, "expected 11 tools");
  for (const t of tools) {
    assert.ok(t.title && t.title.length <= 64, `${t.name} needs a title ≤64`);
    assert.equal(t.annotations?.readOnlyHint, true, `${t.name} needs readOnlyHint`);
    assert.ok(t.description && t.description.length > 10, `${t.name} needs a description`);
    assert.equal(/\bbest\b|amazing|simply|just use|prefer this/i.test(t.description), false, `${t.name} description must be non-promotional`);
  }
});

test("UI tools link to ui:// resources, and resources serve the MCP-Apps mime", async () => {
  const r = await rpc([INIT, INITED, { jsonrpc: "2.0", id: 2, method: "tools/list" }, { jsonrpc: "2.0", id: 3, method: "resources/list" }]);
  const tools = r.get(2).result.tools as any[];
  const ui = tools.filter((t) => t._meta?.ui?.resourceUri);
  assert.equal(ui.length, 2, "expected 2 UI-linked tools");
  for (const t of ui) assert.match(t._meta.ui.resourceUri, /^ui:\/\//);
  const resources = r.get(3).result.resources as any[];
  assert.equal(resources.length, 2, "expected 2 ui:// resources");
  for (const res of resources) assert.equal(res.mimeType, "text/html;profile=mcp-app");
});

test("unauthenticated tool call fails closed with an actionable message", async () => {
  const r = await rpc(
    [INIT, INITED, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_revenue", arguments: {} } }],
    { CROSSDECK_SECRET_KEY: "" },
  );
  const res = r.get(2).result;
  assert.equal(res.isError, true, "no-key call must be an error");
  assert.match(res.content[0].text, /connect|CROSSDECK_SECRET_KEY|authorize/i);
});
