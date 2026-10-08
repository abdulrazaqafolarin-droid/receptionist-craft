/**
 * Actor plan validation gate (Phase 2c): the model proposes, code disposes.
 *
 * Run: deno test supabase/functions/_shared/config/actorPlan.test.ts
 */

import { validateActorPlan } from "./actorPlan.ts";
import { ACTOR_TARGETS } from "./actorRegistry.ts";

function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

Deno.test("absent plan is normal, garbage is rejected safely", () => {
  const empty = validateActorPlan(undefined);
  check(empty.valid.length === 0 && empty.rejected.length === 0, "omission is normal");
  const garbage = validateActorPlan("take over the world");
  check(garbage.valid.length === 0 && garbage.rejected.length === 1, "non-array rejected, never throws");
  const crashy = validateActorPlan([null, 42, "x"]);
  check(crashy.valid.length === 0 && crashy.rejected.length === 3, "junk steps rejected, never throws");
});

Deno.test("valid tour passes sanitized", () => {
  const report = validateActorPlan([
    { type: "say", text: "Hello there.", extra: "dropped" },
    { type: "point", target: "console-stock-check", say: "Look here.", extra: 1 },
    { type: "showcase", target: "connector-card-google_reviews", title: "Chain", lines: ["a", "b", "", 7] },
    { type: "collect", target: "connect-google_reviews", connector_key: "google_reviews" },
  ]);
  check(report.valid.length === 4 && report.rejected.length === 0, "all four valid");
  check((report.valid[0] as unknown as Record<string, unknown>).extra === undefined, "unknown fields stripped");
  check(report.valid.every((s) => s.requiresConfirm === false), "nothing dangerous flagged");
});

Deno.test("unknown targets, types, and forbidden shapes rejected", () => {
  const report = validateActorPlan([
    { type: "point", target: "no-such-panel" },
    { type: "teleport", target: "console-stock-check" },
    { type: "point", target: "connect-password-vault" },
    { type: "say" },
    { type: "showcase", target: "connector-card-google_reviews", title: "No lines" },
    { type: "collect", target: "connect-google_reviews" },
  ]);
  check(report.valid.length === 0, "nothing survives");
  const reasons = report.rejected.map((r) => r.reason).join("|");
  check(reasons.includes("unknown-target"), "unknown target named");
  check(reasons.includes("unknown-type"), "unknown type named");
  check(reasons.includes("say-missing-text"), "empty narration named");
  check(reasons.includes("showcase-missing"), "bad showcase named");
  check(reasons.includes("collect-missing"), "bad collect named");
});

Deno.test("oversize tours capped, text capped", () => {
  const long = "x".repeat(500);
  const steps = Array.from({ length: 20 }, (_, i) => ({ type: "say", text: `step ${i} ${long}` }));
  const report = validateActorPlan(steps);
  check(report.valid.length === 12, "capped at twelve");
  check(report.valid.every((s) => (s.text || "").length <= 300), "text capped");
  check(report.rejected.some((r) => r.reason.includes("capped")), "cap announced");
});

Deno.test("dangerous clicks kept but flagged for live confirm", () => {  ACTOR_TARGETS.push({ key: "test-obliterate", selector: '[data-actor="test-obliterate"]', label: "Test", kind: "button", dangerous: true });
  try {
    const report = validateActorPlan([{ type: "click", target: "test-obliterate" }]);
    check(report.valid.length === 1 && report.valid[0].requiresConfirm === true, "kept and flagged");
  } finally {
    ACTOR_TARGETS.pop();
  }
});

Deno.test("goto validates against manifest routes only", () => {
  const report = validateActorPlan([
    { type: "goto", route: "/console", say: "Follow me." },
    { type: "goto", route: "/admin/nuke" },
    { type: "goto" },
  ]);
  check(report.valid.length === 1, "one honest ride survives");
  check(report.valid[0].route === "/console", "route preserved");
  check(report.rejected.length === 2, "invented + missing routes rejected");
});
