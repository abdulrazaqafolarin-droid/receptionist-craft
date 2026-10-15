/**
 * Actor engine gate: map, guardrails, and runner hold without a browser.
 * DOM hands are stubbed — the runner cannot tell, which is the point.
 *
 * Run: deno test --no-check --unstable-sloppy-imports src/lib/actorEngine.test.ts
 */

import { ACTOR_TARGETS, ACTOR_TEMPLATE_PREFIXES, findTarget } from "./actorMap.ts";
import { guardCheck, isForbiddenKey, parseLiveTable, pickLiveCandidate, type ActorAction } from "./actorGuard.ts";
import { runActorScript, claimActorRun, type ActorDeps } from "./actorRunner.ts";

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

Deno.test("runner: every registered click runs solo, no confirmation ceremony", async () => {
  // The Director works on small things on its own. Nothing in the registry
  // is click-blocked; only unknown and forbidden targets are refused.
  const { ACTOR_TARGETS } = await import("./actorMap.ts");
  ACTOR_TARGETS.push({ key: "test-solo-click", selector: '[data-actor="test-solo"]', label: "Test solo", kind: "button" });
  try {
    const clicked: string[] = [];
    const base = stubDeps({
      click: async () => { clicked.push("boom"); },
    });
    const done = await runActorScript([{ type: "click", target: "test-solo-click" }], base);
    check(done[0].ok && clicked.length === 1, "registered click runs without a gate");
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

Deno.test("runner handle mode: silent theater, live hands", async () => {
  const calls: string[] = [];
  const deps = stubDeps({
    moveCursor: async () => { calls.push("move"); },
    click: async () => { calls.push("click"); },
    say: async () => { calls.push("say"); },
    showcase: async () => { calls.push("showcase"); },
    scrollTo: async () => { calls.push("scroll"); },
    collect: async () => { calls.push("collect"); },
    traverse: async () => { calls.push("traverse"); },
  });
  const receipts = await runActorScript([
    { type: "say", text: "quietly" },
    { type: "point", target: "console-stock-check" },
    { type: "click", target: "console-stock-check" },
    { type: "scroll-to", target: "connections-list" },
    { type: "showcase", target: "connector-card-google_reviews", title: "t", lines: ["a"] },
    { type: "goto", route: "/console" },
    { type: "collect", target: "connect-google_reviews", connector_key: "google_reviews" },
  ], deps, { mode: "handle", continueOnFailure: true });
  check(!calls.includes("say") && !calls.includes("move") && !calls.includes("showcase") && !calls.includes("scroll") && !calls.includes("traverse") && !calls.includes("collect"), "no theater calls in handle mode");
  check(calls.includes("click"), "clicks still execute — that is the work");
  const byDetail = (d: string) => receipts.filter((r) => r.detail === d).length;
  check(byDetail("muted-background") === 1, "say muted honestly");
  check(byDetail("done-background") === 2, "point + click done in background");
  check(byDetail("skipped-background") === 2, "scroll + showcase skipped");
  check(byDetail("deferred-background") === 1, "goto deferred, never jumped blind");
  check(byDetail("needs-owner") === 1, "collect waits for its human");
});

Deno.test("guard: type allowed into registered inputs only, never empty", async () => {
  const ok = guardCheck({ type: "type", target: "console-chat-input", text: "hello stock" });
  check(ok.allowed && ok.reason === "registered-input", "input target typeable");
  const wrong = guardCheck({ type: "type", target: "console-stock-check", text: "x" });
  check(!wrong.allowed && wrong.reason.startsWith("wrong-kind"), "button target not typeable");
  const empty = guardCheck({ type: "type", target: "console-chat-input", text: "   " });
  check(!empty.allowed && empty.reason === "empty-text", "empty text refused");
  const ghost = guardCheck({ type: "type", target: "no-such-input", text: "x" });
  check(!ghost.allowed && ghost.reason.startsWith("unknown-target"), "unknown fails closed");
});

Deno.test("runner: type writes through the host and defers headless", async () => {
  const typed: string[] = [];
  const deps = stubDeps({
    typeInto: async (_el, text, pressReturn) => { typed.push(`${text}|${pressReturn}`); },
  });
  const done = await runActorScript(
    [{ type: "type", target: "console-chat-input", text: "low stock?", press_return: true }],
    deps,
  );
  check(done[0].ok && typed[0] === "low stock?|true", "typed with return flag");
  const silent = await runActorScript(
    [{ type: "type", target: "console-chat-input", text: "x" }],
    stubDeps(),
    { mode: "handle" },
  );
  check(!silent[0].ok && silent[0].detail === "deferred-background", "headless typing defers, never obstructs");
  const noHands = await runActorScript(
    [{ type: "type", target: "console-chat-input", text: "x" }],
    stubDeps(),
  );
  check(!noHands[0].ok && noHands[0].detail === "no-type-handling", "missing host fails closed");
});

Deno.test("guard: drag needs both ends known and touchable", async () => {
  const ok = guardCheck({ type: "drag", from: "console-stock-check", to: "console-tasks-check" });
  check(ok.allowed && ok.reason === "registered-drag", "two registered ends drag");
  const ghost = guardCheck({ type: "drag", from: "console-stock-check", to: "no-such-panel" });
  check(!ghost.allowed && ghost.reason.startsWith("unknown-target"), "unknown end fails the whole drag");
  const { ACTOR_TARGETS } = await import("./actorMap.ts");
  ACTOR_TARGETS.push({ key: "test-logout-link", selector: '[data-actor="test-logout"]', label: "Logout", kind: "button" });
  try {
    const locked = guardCheck({ type: "drag", from: "console-stock-check", to: "test-logout-link" });
    check(!locked.allowed && locked.reason.startsWith("forbidden-target"), "forbidden end fails the whole drag");
  } finally {
    ACTOR_TARGETS.pop();
  }
});

Deno.test("runner: drag moves through the host, defers headless", async () => {
  const drags: string[] = [];
  const { ACTOR_TARGETS } = await import("./actorMap.ts");
  ACTOR_TARGETS.push(
    { key: "test-drag-a", selector: '[data-actor="test-drag-a"]', label: "A", kind: "button" },
    { key: "test-drag-b", selector: '[data-actor="test-drag-b"]', label: "B", kind: "button" },
  );
  try {
    const deps = stubDeps({
      resolve: () => ({ el: true }),
      moveCursor: async () => {},
      dragInto: async () => { drags.push("dragged"); },
    });
    const done = await runActorScript([{ type: "drag", from: "test-drag-a", to: "test-drag-b" }], deps);
    check(done[0].ok && drags.length === 1, "drag executes through the host");
    const silent = await runActorScript(
      [{ type: "drag", from: "test-drag-a", to: "test-drag-b" }],
      stubDeps({ dragInto: async () => { drags.push("nope"); } }),
      { mode: "handle" },
    );
    check(!silent[0].ok && silent[0].detail === "deferred-background", "headless drag defers");
  } finally {
    ACTOR_TARGETS.pop();
    ACTOR_TARGETS.pop();
  }
});

Deno.test("guard: live actions check shape only, resolution is runtime", () => {
  const ok = guardCheck({ type: "live_click", index: 3 });
  check(ok.allowed && ok.reason === "live-action", "positive index passes shape");
  for (const bad of [0, -2, 2.5]) {
    const r = guardCheck({ type: "live_click", index: bad });
    check(!r.allowed && r.reason === "bad-live-index", `index ${bad} refused`);
  }
  const empty = guardCheck({ type: "live_type", index: 1, text: "  " });
  check(!empty.allowed && empty.reason === "empty-text", "empty live text refused");
  const drag = guardCheck({ type: "live_drag", from: 1, to: 2 });
  check(drag.allowed, "live drag shape passes");
});

const liveEl = (label: string) => ({
  getBoundingClientRect: () => ({ width: 40, height: 20, left: 0, top: 0 }),
  __label: label,
});

Deno.test("runner: live click verifies label and refuses honestly", async () => {
  const clicked: string[] = [];
  const deps = stubDeps({
    resolve: () => liveEl("Save changes"),
    describe: (el) => (el as { __label: string }).__label,
    click: async () => { clicked.push("x"); },
  });
  const done = await runActorScript([{ type: "live_click", index: 4 }], deps);
  check(done[0].ok && done[0].detail === "done-live" && clicked.length === 1, "live click executes");
  const ghost = await runActorScript(
    [{ type: "live_click", index: 9 }],
    stubDeps({ resolve: () => null, describe: () => "" }),
  );
  check(!ghost[0].ok && ghost[0].detail === "not-on-screen:live-9", "missing element fails closed");
  const changed = await runActorScript(
    [{ type: "live_click", index: 4, expect: "Save changes" }],
    stubDeps({ resolve: () => liveEl("Cancel order"), describe: (el) => (el as { __label: string }).__label }),
  );
  check(!changed[0].ok && changed[0].detail === "stale-expect:4", "changed label refuses instead of misclicking");
  const money = await runActorScript(
    [{ type: "live_click", index: 2 }],
    stubDeps({ resolve: () => liveEl("Pay now"), describe: (el) => (el as { __label: string }).__label }),
  );
  check(!money[0].ok && money[0].detail.startsWith("refused-live-label"), "money label refused");
  const locked = await runActorScript(
    [{ type: "live_click", index: 2 }],
    stubDeps({ resolve: () => liveEl("Log out"), describe: (el) => (el as { __label: string }).__label }),
  );
  check(!locked[0].ok && locked[0].detail.startsWith("refused-live-label"), "logout refused");
});

Deno.test("runner: live point glides without clicking", async () => {
  const moved: string[] = [];
  const clicked: string[] = [];
  const deps = stubDeps({
    resolve: () => liveEl("Staff"),
    describe: (el) => (el as { __label: string }).__label,
    moveCursor: async () => { moved.push("x"); },
    click: async () => { clicked.push("x"); },
  });
  const done = await runActorScript([{ type: "live_point", index: 2 }], deps);
  check(done[0].ok && done[0].detail === "done-live-point", "point receipt");
  check(moved.length === 1 && clicked.length === 0, "cursor moved, nothing clicked");
  const shape = guardCheck({ type: "live_point", index: 2 });
  check(shape.allowed && shape.reason === "live-action", "point shape passes guard");
});

Deno.test("runner: live type and drag flow through host hands", async () => {
  const typed: string[] = [];
  const tdeps = stubDeps({
    resolve: () => liveEl("Notes"),
    describe: () => "Notes",
    typeInto: async (_el, text) => { typed.push(text); },
  });
  const t = await runActorScript([{ type: "live_type", index: 6, text: "hello" }], tdeps);
  check(t[0].ok && typed[0] === "hello", "live type writes");
  const dragged: string[] = [];
  const ddeps = stubDeps({
    resolve: () => liveEl("item"),
    describe: () => "item",
    dragInto: async () => { dragged.push("x"); },
  });
  const d = await runActorScript([{ type: "live_drag", from: 1, to: 2 }], ddeps);
  check(d[0].ok && dragged.length === 1, "live drag executes");
});

Deno.test("local commands: strict imperatives resolve, vagueness falls to brain", async () => {
  const { parseLocalCommand } = await import("./directorLocalCommands.ts");
  const click = parseLocalCommand("click the Google Reviews connect button");
  check(click !== null && click.kind === "click" && click.target === "connect-google_reviews", "anchor click resolves");
  const goto = parseLocalCommand("go to Analytics");
  check(goto !== null && goto.kind === "goto" && goto.route === "/analytics", "route goto resolves");
  const clickPage = parseLocalCommand("click on Analytics");
  check(clickPage !== null && clickPage.kind === "goto", "click-on-a-page falls through to goto");
  check(parseLocalCommand("how is stock doing?") === null, "question goes to brain");
  check(parseLocalCommand("click") === null, "bare verb goes to brain");
  check(parseLocalCommand("please maybe click something somewhere") === null, "hedged prose goes to brain");
  check(parseLocalCommand("open the pod bay doors") === null, "fiction goes to brain");
});

Deno.test("transient perception: fresh table picks one unambiguous label", () => {
  const rows = ["[1] link | Staff", "[2] link | Conversations", "[3] button | Log out"];
  const picked = pickLiveCandidate("staff page", parseLiveTable(rows));
  check(picked !== null && picked.index === 1 && picked.label === "Staff", "unique staff label wins; refused logout ignored");
  const tie = pickLiveCandidate("staff page", parseLiveTable(["[1] link | Staff", "[2] button | Add Staff Member"]));
  check(tie === null, "equal-strength matches stay unclicked");
  check(pickLiveCandidate("the", parseLiveTable(rows)) === null, "no significant words, no click");
});

Deno.test("transient perception: href context breaks near-ties", () => {
  const rows = ["[1] link | Hours | href=/availability", "[2] link | Hours | href=/settings"];
  const picked = pickLiveCandidate("availability hours", parseLiveTable(rows));
  check(picked !== null && picked.index === 1, "destination context favors the true nav link");
  const parsed = parseLiveTable(rows)[0];
  check(parsed.label === "Hours" && (parsed.meta || "").includes("/availability"), "label stays clean, href kept as meta");
});

Deno.test("local commands: click phrase extraction preserves intent", async () => {
  const { extractClickPhrase } = await import("./directorLocalCommands.ts");
  check(extractClickPhrase("click on the staff page for me") === "on the staff page for me", "click phrase preserved for perception");
  check(extractClickPhrase("how is stock doing?") === null, "non-click goes elsewhere");
});

Deno.test("local commands: inflections and page-filler resolve", async () => {
  const { parseLocalCommand, matchAnchorOrRoute, extractMovementTarget } = await import("./directorLocalCommands.ts");
  const manage = parseLocalCommand("clicks on the manage operators page");
  check(manage !== null && manage.kind === "goto" && manage.route === "/operator-management", "plural verb + plural noun + page filler routes");
  const staff = parseLocalCommand("click on the staff page");
  check(staff !== null && staff.kind === "goto" && staff.route === "/staff", "page filler routes to staff");
  check(parseLocalCommand("click the page") === null, "bare page filler matches nothing");
  check(parseLocalCommand("open the pod bay doors") === null, "fiction still goes to brain");
  check(parseLocalCommand("go to Analytics") !== null, "uninflected goto intact");
  check(extractMovementTarget("clicks the staff link") === "staff link", "plural verb understood mid-lane");
  const anchor = matchAnchorOrRoute("manage operators");
  check(anchor !== null && anchor.kind === "goto" && anchor.route === "/operator-management", "plural noun stems match");
});

Deno.test("understanding lane: toggle verbs and multi-target split", async () => {
  const { extractMovementTarget, splitTargets } = await import("./directorLocalCommands.ts");
  check(extractMovementTarget("close the overview and the your operator dropdowns") === "overview and the your operator dropdowns", "close verb understood");
  check(extractMovementTarget("collapse all menus") === "all menus", "collapse verb understood");
  check(splitTargets("overview and the your operator dropdowns").length === 2, "conjunction splits in two");
  check(splitTargets("overview, operator, staff").length === 3, "commas split, capped at three");
  check(splitTargets("overview and a and b and c").length === 3, "cap is three");
  check(splitTargets("availability").length === 1, "plain target untouched");
  const rows = ["[1] button | Overview", "[2] button | Your Operator", "[3] link | Conversations"];
  const [a, b] = splitTargets("overview and the your operator dropdowns");
  const pa = pickLiveCandidate(a, parseLiveTable(rows));
  const pb = pickLiveCandidate(b, parseLiveTable(rows));
  check(pa !== null && pa.label === "Overview", "first dropdown resolves");
  check(pb !== null && pb.label === "Your Operator", "second dropdown resolves");
});

Deno.test("understanding lane: movement verbs found anywhere, negations never act", async () => {
  const { extractMovementTarget, matchAnchorOrRoute } = await import("./directorLocalCommands.ts");
  check(extractMovementTarget("please click on the availability page for me") === "availability page", "polite phrasing understood");
  check(extractMovementTarget("can you open the staff roster now") === "staff roster", "mid-sentence verb understood");
  check(extractMovementTarget("how is stock doing?") === null, "no verb, no target");
  check(extractMovementTarget("don't click cancel") === null, "negated verb never acts");
  check(extractMovementTarget("never open settings") === null, "never-guard holds");
  const anchor = matchAnchorOrRoute("Google Reviews connect button");
  check(anchor !== null && anchor.kind === "click", "raw phrase matches anchor");
  check(matchAnchorOrRoute("pod bay doors") === null, "fiction matches nothing");
});

const gestureDeps = (over: Partial<ActorDeps> = {}): ActorDeps & { points: Array<{ x: number; y: number }>; clicks: string[]; types: string[] } => {
  const points: Array<{ x: number; y: number }> = [];
  const clicks: string[] = [];
  const types: string[] = [];
  const deps: ActorDeps = {
    resolve: () => ({ el: true }),
    moveCursor: async () => {},
    highlight: async () => {},
    scrollTo: async () => {},
    click: async () => { clicks.push("x"); },
    typeInto: async () => { types.push("x"); },
    say: async () => {},
    showcase: async () => {},
    collect: async () => {},
    isStopped: () => false,
    stepDelayMs: 0,
    locate: () => ({ x: 100, y: 100 }),
    moveTo: async (x, y) => { points.push({ x, y }); },
    viewport: () => ({ w: 800, h: 600 }),
    ...over,
  };
  return Object.assign(deps, { points, clicks, types });
};

Deno.test("gesture: oscillate produces the expected cursor-state sequence, never clicks", async () => {
  const deps = gestureDeps();
  const done = await runActorScript(
    [{ type: "gesture", kind: "oscillate", target: "console-stock-check" }],
    deps,
  );
  check(done.length === 1 && done[0].ok && done[0].detail === "done-gesture:oscillate", "oscillate receipt");
  const seq = deps.points.map((p) => `${p.x},${p.y}`).join(" ");
  check(seq === "100,100 124,100 76,100 124,100 76,100 100,100", `swing sequence exact (got ${seq})`);
  check(deps.clicks.length === 0 && deps.types.length === 0, "no click or type during expressive movement");
});

Deno.test("gesture: compound primitives sequence in order", async () => {
  const deps = gestureDeps();
  const done = await runActorScript([
    { type: "gesture", kind: "move", target: "console-stock-check" },
    { type: "gesture", kind: "pause", ms: 100 },
    { type: "gesture", kind: "circle", target: "console-stock-check", radius: 10 },
  ], deps);
  check(done.length === 3 && done.every((r) => r.ok), "all three primitives succeed");
  check(done[0].detail === "done-gesture:move", "move receipt");
  check(done[1].detail === "done-gesture:pause", "pause receipt");
  check(done[2].detail === "done-gesture:circle", "circle receipt");
  check(deps.points.length === 1 + 13, `1 move point + 13 circle points (got ${deps.points.length})`);
});

Deno.test("gesture: invalid parameters rejected before execution", async () => {
  const bad: Array<[unknown, string]> = [
    [{ type: "gesture", kind: "teleport", target: "a" }, "bad-gesture:unknown-kind"],
    [{ type: "gesture", kind: "oscillate", target: "a", amplitude: 999 }, "bad-gesture:amplitude-out-of-range"],
    [{ type: "gesture", kind: "oscillate", target: "a", cycles: 0 }, "bad-gesture:cycles-out-of-range"],
    [{ type: "gesture", kind: "oscillate", target: "a", index: 3 }, "bad-gesture:need-exactly-one-anchor"],
    [{ type: "gesture", kind: "oscillate" }, "bad-gesture:need-exactly-one-anchor"],
    [{ type: "gesture", kind: "circle", target: "a", radius: -5 }, "bad-gesture:radius-out-of-range"],
    [{ type: "gesture", kind: "pause", target: "a" }, "bad-gesture:pause-takes-no-target"],
    [{ type: "gesture", kind: "pause", ms: 99999 }, "bad-gesture:pause-ms-out-of-range"],
  ];
  for (const [a, reason] of bad) {
    const v = guardCheck(a as ActorAction);
    check(!v.allowed && v.reason === reason, `guard refuses: ${reason}`);
  }
  const deps = gestureDeps();
  const run = await runActorScript(
    [{ type: "gesture", kind: "oscillate", target: "console-stock-check", amplitude: 999 } as ActorAction],
    deps,
  );
  check(!run[0].ok && run[0].detail === "bad-gesture:amplitude-out-of-range", "runner refuses before moving");
  check(deps.points.length === 0, "no movement on refused gesture");
});

Deno.test("gesture: STOP cancels mid-sequence at a sub-step boundary", async () => {
  let stopped = false;
  let moves = 0;
  const deps = gestureDeps({
    isStopped: () => stopped,
    moveTo: async (_x: number, _y: number) => {
      moves += 1;
      if (moves === 2) stopped = true;
    },
  });
  const done = await runActorScript(
    [{ type: "gesture", kind: "oscillate", target: "console-stock-check", cycles: 4 }],
    deps,
  );
  check(!done[0].ok && done[0].detail === "stopped-by-owner", "mid-gesture stop receipt");
  check(moves === 2, `halted at the boundary (got ${moves} moves)`);
});

Deno.test("runs: newer claim preempts the older run", async () => {
  const deps = gestureDeps();
  const token = claimActorRun();
  const run = runActorScript(
    [{ type: "gesture", kind: "pause", ms: 2000 }],
    deps,
    { runToken: token },
  );
  claimActorRun(); // a newer run starts elsewhere
  const done = await run;
  check(!done[0].ok && done[0].detail === "preempted-by-newer-run", "older run stands down");
});

Deno.test("motion: curved path reaches the exact target, deterministically", async () => {
  const { planHumanPath, easeInOut, mulberry32 } = await import("./actorRunner.ts");
  const from = { x: 0, y: 0 };
  const to = { x: 400, y: 300 };
  const a = planHumanPath(from, to, 7);
  const b = planHumanPath(from, to, 7);
  check(JSON.stringify(a) === JSON.stringify(b), "same seed = identical waypoints");
  const last = a[a.length - 1];
  check(last.x === 400 && last.y === 300, "path lands exactly on target");
  check(a.length >= 6 && a.length <= 16, `distance-scaled waypoint count (got ${a.length})`);
  const curved = a.some((p) => Math.abs(p.y - (p.x * 0.75)) > 2);
  check(curved, "path deviates from the straight line (it curves)");
  const near = planHumanPath({ x: 10, y: 10 }, { x: 11, y: 11 }, 7);
  check(near.length === 1, "near-zero hop collapses to one point");
  check(easeInOut(0) === 0 && easeInOut(1) === 1 && easeInOut(0.5) === 0.5, "easing endpoints exact");
  const r1 = mulberry32(7)();
  const r2 = mulberry32(7)();
  check(r1 === r2, "seeded PRNG reproducible");
});

Deno.test("motion: human pace glides through waypoints before clicking", async () => {
  const moves: Array<{ x: number; y: number }> = [];
  const clicked: string[] = [];
  const deps = stubDeps({
    resolve: () => ({ el: true }),
    locate: () => ({ x: 400, y: 0 }),
    cursorPos: () => ({ x: 0, y: 0 }),
    moveTo: async (x: number, y: number) => { moves.push({ x, y }); },
    viewport: () => ({ w: 800, h: 600 }),
    click: async () => { clicked.push("x"); },
  });
  const done = await runActorScript(
    [{ type: "click", target: "console-stock-check" }],
    deps,
    { pace: "human" },
  );
  check(done[0].ok, "human-paced click succeeds");
  check(moves.length >= 6, `glide played waypoints (got ${moves.length})`);
  const last = moves[moves.length - 1];
  check(last.x === 400 && last.y === 0, "glide lands on target center");
  check(clicked.length === 1, "the real click still lands once");
});

Deno.test("motion: brisk pace preserves legacy single-set positioning", async () => {
  const moved: string[] = [];
  const clicked: string[] = [];
  const deps = stubDeps({
    resolve: () => ({ el: true }),
    moveCursor: async () => { moved.push("x"); },
    click: async () => { clicked.push("x"); },
  });
  const done = await runActorScript([{ type: "click", target: "console-stock-check" }], deps);
  check(done[0].ok, "brisk click succeeds");
  check(moved.length === 1 && clicked.length === 1, "one move, one click — today's behavior exactly");
});

Deno.test("motion: STOP aborts a glide mid-waypoint", async () => {
  let stopped = false;
  let moves = 0;
  const deps = stubDeps({
    resolve: () => ({ el: true }),
    locate: () => ({ x: 600, y: 0 }),
    cursorPos: () => ({ x: 0, y: 0 }),
    moveTo: async () => {
      moves += 1;
      if (moves === 2) stopped = true;
    },
    viewport: () => ({ w: 800, h: 600 }),
    isStopped: () => stopped,
  });
  const done = await runActorScript(
    [{ type: "click", target: "console-stock-check" }],
    deps,
    { pace: "human" },
  );
  check(!done[0].ok && done[0].detail === "stopped-by-owner", "mid-glide stop receipt");
  check(moves === 2, `halted at the waypoint boundary (got ${moves})`);
});

Deno.test("motion: reduced-motion collapses the curve to one jump", async () => {
  const moves: Array<{ x: number; y: number }> = [];
  const deps = stubDeps({
    resolve: () => ({ el: true }),
    locate: () => ({ x: 400, y: 300 }),
    cursorPos: () => ({ x: 0, y: 0 }),
    moveTo: async (x: number, y: number) => { moves.push({ x, y }); },
    viewport: () => ({ w: 800, h: 600, reducedMotion: true }),
    click: async () => {},
  });
  const done = await runActorScript(
    [{ type: "click", target: "console-stock-check" }],
    deps,
    { pace: "human" },
  );
  check(done[0].ok, "reduced-motion click succeeds");
  check(moves.length === 1 && moves[0].x === 400 && moves[0].y === 300, "one instant jump, no animation");
});

Deno.test("motion: pre-click dwell hesitates, over-cap dwell refused", async () => {
  const ok = guardCheck({ type: "click", target: "console-stock-check", dwellMs: 500 });
  check(ok.allowed, "in-cap dwell passes guard");
  const over = guardCheck({ type: "click", target: "console-stock-check", dwellMs: 99999 });
  check(!over.allowed && over.reason === "bad-dwell", "over-cap dwell refused");
  const stray = guardCheck({ type: "point", target: "console-stock-check", dwellMs: 100 } as unknown as ActorAction);
  check(!stray.allowed && stray.reason === "bad-dwell", "dwell on non-click refused");
  const deps = stubDeps({ resolve: () => ({ el: true }), moveCursor: async () => {}, click: async () => {} });
  const t0 = Date.now();
  const done = await runActorScript(
    [{ type: "live_click", index: 1, dwellMs: 120 }],
    { ...deps, resolve: () => ({ getBoundingClientRect: () => ({ width: 40, height: 20 }), __l: "Save" }), describe: () => "Save" },
  );
  check(done[0].ok && Date.now() - t0 >= 100, "dwell delays the click");
});

Deno.test("motion: human pace types in watched chunks, brisk in one call", async () => {
  const seen: string[] = [];
  const el = { getBoundingClientRect: () => ({ width: 60, height: 20 }) };
  const human = stubDeps({
    resolve: () => el,
    describe: () => "Search",
    typeInto: async (_e, text: string) => { seen.push(text); },
  });
  const done = await runActorScript(
    [{ type: "live_type", index: 1, text: "Tess Anderson" }],
    human,
    { pace: "human" },
  );
  check(done[0].ok, "human-paced type succeeds");
  check(seen.length > 1, `typed progressively (got ${seen.length} chunks)`);
  check(seen[seen.length - 1] === "Tess Anderson", "final chunk holds the full text");
  for (let i = 1; i < seen.length; i++) {
    check(seen[i].startsWith(seen[i - 1]), "chunks are progressive prefixes");
  }
  const once: string[] = [];
  const brisk = stubDeps({
    resolve: () => el,
    describe: () => "Search",
    typeInto: async (_e, text: string) => { once.push(text); },
  });
  const done2 = await runActorScript(
    [{ type: "live_type", index: 1, text: "Tess Anderson" }],
    brisk,
  );
  check(done2[0].ok && once.length === 1 && once[0] === "Tess Anderson", "brisk types once, unchanged");
});

Deno.test("poc: customers task resolves through local lanes, rows are perceivable", async () => {
  const { parseLocalCommand, extractMovementTarget, matchAnchorOrRoute } = await import("./directorLocalCommands.ts");
  const open = parseLocalCommand("open the customers page");
  check(open !== null && open.kind === "goto" && open.route === "/customers", "open customers routes");
  const find = extractMovementTarget("find the customer Tess");
  check(find === null, "find is a search task, not a movement verb — task loop owns it, not a hardcoded phrase");
  const rows = ["[1] input[text] | Search by name, email, or phone...", "[2] button | Tess Anderson"];
  const search = pickLiveCandidate("search", parseLiveTable(rows));
  check(search !== null && search.index === 1, "search input resolves from its placeholder label");
  const tess = pickLiveCandidate("Tess Anderson", parseLiveTable(rows));
  check(tess !== null && tess.index === 2, "customer row resolves by name");
  void matchAnchorOrRoute;
});
