/**
 * Director presence steps gate: registered targets only, say-only elsewhere.
 *
 * Run: deno test supabase/functions/_shared/directorSteps.test.ts
 */

import { stockSteps, requeueSteps, draftSteps } from "./directorSteps.ts";
import { ACTOR_TARGETS } from "./config/actorRegistry.ts";

function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const targetKeys = new Set(ACTOR_TARGETS.map((t) => t.key));

Deno.test("stock steps ride to the console and highlight a real target", () => {
  const steps = stockSteps("Pharmacy", 2);
  check(steps[0].type === "goto" && steps[0].route === "/console", "rides to console");
  const hl = steps.find((s) => s.type === "highlight");
  check(!!hl && targetKeys.has(hl.target || ""), "highlight names a registered target");
  check(steps.some((s) => s.type === "say" && (s.say || "").includes("Pharmacy")), "narrates the operator");
});

Deno.test("requeue and draft steps are narration-only", () => {
  for (const steps of [requeueSteps("Ruth"), draftSteps("Helper")]) {
    check(steps.length > 0 && steps.every((s) => s.type === "say"), "say-only, no UI surface");
    check(steps.every((s) => !s.target && !s.route), "no target or route to invent");
  }
});
