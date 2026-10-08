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
    showcase: async (_el, title) => { seen.push("showcase:" + title); },
    collect: async (k) => { seen.push("collect:" + k); },
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
    showcase: async () => { calls.push("showcase"); },
    collect: async () => { calls.push("collect"); },
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
    showcase: async () => {},
    collect: async () => {},
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

function stubDeps(extra: Partial<ActorDeps> = {}): ActorDeps {
  return {
    resolve: (sel) => ({ sel }),
    moveCursor: async () => {},
    highlight: async () => {},
    scrollTo: async () => {},
    click: async () => {},
    say: async () => {},
    showcase: async () => {},
    collect: async () => {},
    isStopped: () => false,
    ...extra,
  };
}

Deno.test("runner: showcase opens beside its anchor", async () => {
  let shown: { title: string; lines: string[] } | null = null;
  const deps = stubDeps({
    showcase: async (_el, title, lines) => { shown = { title, lines }; },
  });
  const receipts = await runActorScript([
    { type: "showcase", target: "connector-card-google_reviews", title: "Google Reviews chain", lines: ["a", "b"] },
  ], deps);
  check(receipts[0].ok, "showcase succeeds");
  check(shown !== null && (shown as { title: string }).title === "Google Reviews chain", "box content delivered");
});

Deno.test("runner: collect hands the connector key to the host", async () => {
  let collected: string | null = null;
  const deps = stubDeps({ collect: async (k) => { collected = k; } });
  const receipts = await runActorScript([
    { type: "collect", target: "connect-google_reviews", connector_key: "google_reviews" },
  ], deps);
  check(receipts[0].ok && collected === "google_reviews", "real dialog requested for the right key");
});

Deno.test("runner: confirm gate asks, honors yes and no", async () => {
  // No dangerous entries ship in the pilot registry by design, so the test
  // stages one, proves the handshake, and removes it — the verdict,
  // dialog call, and both outcomes run through the real code path.
  const { ACTOR_TARGETS } = await import("./actorMap.ts");
  ACTOR_TARGETS.push({ key: "test-nuke-everything", selector: '[data-actor="test-nuke"]', label: "Test nuke", kind: "button", dangerous: true });
  try {
    let asked = 0;
    const clicked: string[] = [];
    const base = stubDeps({
      click: async () => { clicked.push("boom"); },
      requestConfirm: async () => { asked++; return true; },
    });
    const granted = await runActorScript([{ type: "click", target: "test-nuke-everything" }], base);
    check(granted[0].ok && asked === 1 && clicked.length === 1, "yes proceeds after asking");

    const denied = await runActorScript(
      [{ type: "click", target: "test-nuke-everything" }],
      stubDeps({ requestConfirm: async () => false }),
    );
    check(!denied[0].ok && denied[0].detail === "cancelled-by-owner", "no cancels honestly");

    const unwired = await runActorScript(
      [{ type: "click", target: "test-nuke-everything" }],
      stubDeps(),
    );
    check(!unwired[0].ok && unwired[0].detail.startsWith("confirm-required"), "missing dialog fails closed");
  } finally {
    ACTOR_TARGETS.pop();
  }
});

Deno.test("guard: goto allows manifest routes, rejects the invented", async () => {
  const { guardCheck } = await import("./actorGuard.ts");
  const ok = guardCheck({ type: "goto", route: "/console" });
  check(ok.allowed && ok.reason === "manifest-route", "manifest route allowed");
  const bad = guardCheck({ type: "goto", route: "/admin/nuke" });
  check(!bad.allowed && bad.reason.startsWith("unknown-route"), "invented route rejected");
});

Deno.test("runner: goto needs traverse handling, glides when anchored", async () => {
  const blind = await runActorScript(
    [{ type: "goto", route: "/console" }],
    stubDeps(),
  );
  check(!blind[0].ok && blind[0].detail === "no-traverse-handling", "jumping blind fails closed");

  const moves: string[] = [];
  let traversed: string | null = null;
  const staged = await runActorScript(
    [{ type: "goto", route: "/console", say: "Follow me." }],
    stubDeps({
      moveCursor: async (el) => { moves.push(el !== null ? "glide" : "none"); },
      resolveNav: (route) => (route === "/console" ? { nav: true } : null),
      traverse: async (route) => { traversed = route; },
    }),
  );
  check(staged[0].ok && traversed === "/console" && moves.includes("glide"), "anchored ride glides then traverses");

  const unanchored: string[] = [];
  const bare = await runActorScript(
    [{ type: "goto", route: "/console" }],
    stubDeps({
      resolveNav: () => null,
      traverse: async () => { unanchored.push("traversed"); },
    }),
  );
  check(bare[0].ok && unanchored.length === 1, "anchorless ride still traverses (fades in place)");
});
