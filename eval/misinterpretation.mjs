#!/usr/bin/env node
/**
 * Prism misinterpretation eval (Prism Robustness RFC §9) — the PROOF that the
 * whole "No Bare Numbers" design works: that the model actually READS the
 * `meta.semantics` sidecar + `data.coverage` and does NOT misreport a value.
 *
 * The design bets the model consults the packed bag instead of guessing from a
 * field name. This harness verifies that bet: it hands the model the exact
 * connector instruction (CONNECTOR_INSTRUCTIONS) + a real enveloped tool result
 * where the NAIVE FIELD NAME MISLEADS but the sidecar corrects, asks the
 * misinterpretation-bait question, and asserts the answer honors the sidecar.
 *
 * Run:  ANTHROPIC_API_KEY=sk-... npm run build && npm run eval
 * Model: EVAL_MODEL env (default claude-sonnet-5 — what a user's Prism runs on).
 *
 * A failing case here means the sidecar is being ignored → back to "9 users".
 * This is the gate to trust the pattern across every surface.
 */

import { CONNECTOR_INSTRUCTIONS } from "../dist/instructions.js";

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.EVAL_MODEL ?? "claude-sonnet-5";

if (!API_KEY) {
  console.error("SKIP: set ANTHROPIC_API_KEY to run the misinterpretation eval.");
  process.exit(2);
}

/** One enveloped tool result, as the MCP hands it to the model (content text). */
function toolResult(payload) {
  return JSON.stringify(payload, null, 2);
}

/** The cases: each is a payload whose naive field name would mislead, the
 *  question that baits the misread, and assertions the answer must satisfy. */
const CASES = [
  {
    name: "attributedActors is NOT a user count (the '9 users' bug)",
    tool: "get_read_cost",
    payload: {
      data: {
        window: { days: 30, from: "2026-06-04", to: "2026-07-04" },
        coverage: { state: "measured", note: "Metered server-side reads only. Excludes the outbound API and iOS surfaces." },
        totalReads: 812443,
        split: { perUserReads: 41200, overheadReads: 771243, overheadPct: 95 },
        attributedActors: 9,
      },
      meta: {
        semantics: {
          attributedActors: {
            label: "Attributed actors",
            means: "Distinct actor keys the SDK reported via setActor() during cost attribution — INCLUDES background/service/internal actors.",
            isNot: "registered users, paying customers, active people, or any user census — a 0 usually means the SDK isn't calling setActor(). For a real customer count, use get_revenue.payingCustomers.",
            authority: "maintained bucketRollups ledger (byActor)",
            unit: "count",
          },
        },
      },
    },
    question: "How many users does this app have?",
    // Must NOT claim "9 users"; must flag that this isn't a user count / point elsewhere.
    mustNotMatch: [/\b9\s+(registered\s+|paying\s+|active\s+)?users\b/i, /\bhas\s+9\s+users\b/i, /\b9\s+customers\b/i],
    mustMatch: [/actor|setActor|attribut|not\s+(a\s+)?user|isn'?t\s+a\s+user|no\s+user\s+count|paying[- ]?customers|get_revenue/i],
  },
  {
    name: "not_instrumented is NOT zero (the 'Grid: 0 users' bug)",
    tool: "get_read_cost",
    payload: {
      data: {
        window: { days: 30, from: "2026-06-04", to: "2026-07-04" },
        coverage: { state: "not_instrumented", note: "No read-cost attribution is flowing for this app yet. This is NOT zero database reads — the Buckets meter isn't reporting for this app." },
        totalReads: null,
        split: null,
        attributedActors: null,
      },
      meta: { semantics: {} },
    },
    question: "How many database reads and users does Grid have? Give me the numbers.",
    // Must NOT report 0; must say not instrumented / not wired yet.
    mustNotMatch: [/\b0\s+users\b/i, /\bzero\s+users\b/i, /\b0\s+(database\s+)?reads\b/i, /\bno\s+database\s+cost\b/i],
    mustMatch: [/not\s+instrumented|isn'?t\s+(wired|set\s+up|instrumented|reporting)|not\s+wired|no\s+attribution\s+(is\s+)?flowing/i],
  },
];

async function ask(question, tool, resultText) {
  const body = {
    model: MODEL,
    max_tokens: 400,
    system: CONNECTOR_INSTRUCTIONS,
    messages: [
      {
        role: "user",
        content:
          `I called the Crossdeck tool \`${tool}\` and it returned this result. ` +
          `Answer my question using ONLY this result.\n\n` +
          `TOOL RESULT:\n${resultText}\n\nQUESTION: ${question}`,
      },
    ],
  };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return (j.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

let failed = 0;
for (const c of CASES) {
  const answer = await ask(c.question, c.tool, toolResult(c.payload));
  const badHit = (c.mustNotMatch ?? []).find((re) => re.test(answer));
  const goodMiss = (c.mustMatch ?? []).find((re) => !re.test(answer));
  const ok = !badHit && !goodMiss;
  console.log(`\n${ok ? "PASS" : "FAIL"} — ${c.name}`);
  if (!ok) {
    failed++;
    if (badHit) console.log(`  crossed the isNot line (matched ${badHit}).`);
    if (goodMiss) console.log(`  did not honor the sidecar (missing ${goodMiss}).`);
    console.log(`  --- model answer ---\n  ${answer.replace(/\n/g, "\n  ")}`);
  }
}

console.log(`\n${failed === 0 ? "ALL PASS — the model reads the bag we packed." : `${failed} FAILED — the sidecar is being ignored.`}`);
process.exit(failed === 0 ? 0 : 1);
