/**
 * Decide contract gate: strict JSON in, strict shapes out.
 *
 * Run: deno test supabase/functions/_shared/directorDecide.test.ts
 */

import { buildDecidePrompt, parseDecision, parsePlan } from "./directorDecide.ts";

function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const TABLE = `[1] button | Find stays
[4] textbox | Destination`;

Deno.test("prompt carries goal, table, history, and shape", () => {
  const loop = buildDecidePrompt({ goal: "Find stays", url: "https://x.test", table: TABLE, history: [], mode: "loop" });
  check(loop.includes("Find stays") && loop.includes("[4] textbox"), "goal + table present");
  check(loop.includes("first decision"), "empty history stated");
  check(loop.includes("never invent indexes"), "index discipline stated");
  const plan = buildDecidePrompt({ goal: "g", url: "u", table: TABLE, history: ["CLICK [2]"], mode: "plan" });
  check(plan.includes('"plan"') && plan.includes("1. CLICK [2]"), "plan shape + numbered history");
});

Deno.test("decisions parse strictly, junk fails loud", () => {
  const good = parseDecision('```json\n{"operation":"TYPE_TEXT","target":"4","text":"Lagos"}\n```');
  check(good.operation === "TYPE_TEXT" && good.text === "Lagos", "fences tolerated, text kept");
  const done = parseDecision('{"operation":"DONE"}');
  check(done.operation === "DONE", "terminal parses without target");
  for (const bad of [
    '{"operation":"CLICK"}',
    '{"operation":"TYPE_TEXT","target":"4"}',
    '{"operation":"FLY","target":"1"}',
    '{"operation":"BLOCKED"}',
    "not json at all",
  ]) {
    let threw = false;
    try {
      parseDecision(bad);
    } catch {
      threw = true;
    }
    check(threw, `rejected: ${bad.slice(0, 30)}`);
  }
});

Deno.test("plans parse strictly, terminals and overflows rejected", () => {
  const plan = parsePlan('{"plan":[{"operation":"CLICK","target":"2"},{"operation":"WAIT"}]}');
  check(plan.plan.length === 2, "plan kept");
  for (const bad of [
    '{"plan":[]}',
    '{"plan":[{"operation":"DONE"}]}',
    '{"plan":[{"operation":"CLICK"}]}',
    '{"nope":[]}',
  ]) {
    let threw = false;
    try {
      parsePlan(bad);
    } catch {
      threw = true;
    }
    check(threw, `rejected: ${bad.slice(0, 30)}`);
  }
});

Deno.test("lane limits append verbatim, absent by default", () => {
  const base = { goal: "g", url: "u", table: "[1] button | Go", history: [], mode: "loop" as const };
  const plain = buildDecidePrompt(base);
  check(!plain.includes("LANE LIMITS"), "no limits section by default");
  const limited = buildDecidePrompt({ ...base, limits: "No SELECT here." });
  check(limited.includes("LANE LIMITS") && limited.includes("No SELECT here."), "limits appended");
});
