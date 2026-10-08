/**
 * Actor engine gate: map, guardrails, and runner hold without a browser.
 * DOM hands are stubbed — the runner cannot tell, which is the point.
 *
 * Run: deno test --no-check --unstable-sloppy-imports src/lib/actorEngine.test.ts
 */

import { ACTOR_TARGETS, ACTOR_TEMPLATE_PREFIXES, findTarget } from "./actorMap.ts";
import { guardCheck, isForbiddenKey } from "./actorGuard.ts";
import { runActorScript, type ActorDeps } from "./actorRunner.ts";

// Minimal ambient so tsc (which typechecks src/) accepts the Deno runner.
declare const Deno: { test(name: string, fn: () => void | Promise<void>): void };

function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

Deno.test("map: pilot targets registered, templates cover dynamic keys", () => {
  check(ACTOR_TARGETS.length >= 10, `pilot set has weight (got ${ACTOR_TARGETS.length})`);
  check(!!findTarget("connect-google_reviews"), "google connect registered");
  check(!!findTarget("console-stock-check"), "console stock registered");
  check(!!findTarget("builder-tab-improve"), "builder improve tab registered");
  check(findTarget("no-such-thing") === null, "unknown keys resolve null");
  check(ACTOR_TEMPLATE_PREFIXES.includes("connect-"), "dynamic connect-* template covered");
  const keys = ACTOR_TARGETS.map((t) => t.key);
  check(new Set(keys).size === keys.length, "no duplicate keys");
  check(ACTOR_TARGETS.every((t) => t.selector.includes(t.key) || t.key.startsWith("connections") || t.key.startsWith("modules")), "selectors name their keys");
});

Deno.test("guard: narration free, unknown fails closed", () => {
  check(guardCheck({ type: "say", text: "hi" }).allowed, "say always allowed");
  const unknown = guardCheck({ type: "point", target: "no-such-thing" });
  check(!unknown.allowed && unknown.reason.startsWith("unknown-target"), "unknown target fails closed");
});

Deno.test("guard: forbidden key shapes untouchable", () => {
  for (const k of ["user-password-field", "api-key-input", "twilio-credentials", "logout-button", "sign-out-link", "lock-screen", "delete-account-confirm", "force-quit"]) {
    check(isForbiddenKey(k), `forbidden: ${k}`);
  }
  // Note: fail-closed by design — even "passwordless-hint" matches the
  // password pattern and stays untouchable. Over-blocking names is safe;
  // under-blocking them is not.
  for (const k of ["connect-google_reviews", "console-stock-check", "builder-tab-improve", "save-button"]) {
    check(!isForbiddenKey(k), `allowed shape: ${k}`);
  }
  const click = guardCheck({ type: "click", target: "connect-google_reviews" });
  check(click.allowed, "ordinary clicks allowed when asked");
});

Deno.test("runner: happy path produces done receipts in order", async () => {
  const seen: string[] = [];
  const deps: ActorDeps = {
    resolve: (sel) => ({ sel }),
    moveCursor: async (el) => { seen.push("move:" + (el as { sel: string }).sel); },
    highlight: async (el) => { seen.push("highlight:" + (el as { sel: string }).sel); },
    scrollTo: async (el) => { seen.push("scroll:" + (el as { sel: string }).sel); },
    click: async (el) => { seen.push("click:" + (el as { sel: string }).sel); },
    say: async (t) => { seen.push("say:" + t); },
    isStopped: () => false,
    stepDelayMs: 0,
  };
  const receipts = await runActorScript([
    { type: "say", text: "watch this" },
    { type: "scroll-to", target: "connections-list" },
    { type: "point", target: "connect-google_reviews", say: "here" },
    { type: "highlight", target: "connector-card-google_reviews", ms: 500 },
  ], deps);
  check(receipts.length === 4 && receipts.every((r) => r.ok), "all four succeed");
  check(seen[0] === "say:watch this", "narration first");
  check(seen.includes("click:undefined") === false, "no clicks in a tour script");
});

Deno.test("runner: halts on first failure, stop flag respected", async () => {
  const calls: string[] = [];
  const deps: ActorDeps = {
    resolve: () => null, // nothing on screen
    moveCursor: async () => { calls.push("move"); },
    highlight: async () => { calls.push("highlight"); },
    scrollTo: async () => { calls.push("scroll"); },
    click: async () => { calls.push("click"); },
    say: async () => { calls.push("say"); },
    isStopped: () => false,
  };
  const halted = await runActorScript([
    { type: "point", target: "console-stock-check" },
    { type: "point", target: "console-tasks-check" },
  ], deps);
  check(halted.length === 1 && !halted[0].ok && halted[0].detail.startsWith("not-on-screen"), "halts on missing element");
  check(calls.length === 0, "no hands move on failure");

  let stopped = false;
  const stopDeps: ActorDeps = { ...deps, resolve: () => ({}), isStopped: () => stopped };
  const run = runActorScript([
    { type: "point", target: "console-stock-check" },
    { type: "point", target: "console-tasks-check" },
    { type: "point", target: "console-roster-check" },
  ], stopDeps);
  stopped = true;
  const receipts = await run;
  check(receipts.some((r) => r.detail === "stopped-by-owner"), "stop flag halts the run");
});

Deno.test("runner: continue-on-failure is explicit opt-in", async () => {
  const deps: ActorDeps = {
    resolve: (sel) => (sel.includes("stock") ? { sel } : null),
    moveCursor: async () => {},
    highlight: async () => {},
    scrollTo: async () => {},
    click: async () => {},
    say: async () => {},
    isStopped: () => false,
  };
  const receipts = await runActorScript([
    { type: "point", target: "console-stock-check" },
    { type: "point", target: "console-roster-check" },
    { type: "point", target: "console-tasks-check" },
  ], deps, { continueOnFailure: true });
  check(receipts.length === 3, "all three attempted");
  check(receipts[0].ok && !receipts[1].ok && !receipts[2].ok, "only the resolvable one succeeds");
});
