/**
 * Director prompt gate: context assembles honestly, replies parse strictly.
 *
 * Run: deno test supabase/functions/_shared/config/directorPrompt.test.ts
 */

import { buildDirectorSystemPrompt, parseDirectorReply } from "./directorPrompt.ts";
import type { DirectorContext } from "./directorPrompt.ts";

function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const CTX: DirectorContext = {
  ownerId: "owner-1",
  operators: [{
    id: "op-1", display: "Pharmacy", kind: "ops", model: "internal",
    active: true, upcomingBookings: 0, openEscalations: 0, stockNeeds: 2, overdueTasks: 1,
    productCount: 4,
  }],
  versions: [{ operator: "Pharmacy", version_number: 3, change_source: "owner_revert", owner_input: "back to v2", created_at: "2026-10-01T00:00:00Z" }],
  threads: [{ title: "Stock setup", status: "approved", receptionist_name: "Pharmacy", updated_at: "2026-10-02T00:00:00Z" }],
  failedJobs: 1,
  failedJobDetails: [{ job_id: "abcd1234-efgh", operator: "Pharmacy", error: "gateway_timeout", created_at: "2026-10-07T00:00:00Z" }],
  activeJobs: 0,
  connectorsDown: ["Gmail"],
  attentionTotal: 3,
  pastChats: [{ title: "Morning review", updated_at: "2026-10-08T09:00:00Z" }],
  recentWork: [{ kind: "job_retry", summary: "Re-queued failed plan", created_at: "2026-10-09T10:00:00Z" }],
  unreadNotifications: [{ title: "Plan failed: Pharmacy", created_at: "2026-10-09T11:00:00Z" }],
  devices: [
    { id: "dev-1", name: "Office PC", platform: "windows", enabled: true, last_seen: "2026-10-09T12:00:00Z" },
    { id: "dev-2", name: "Old laptop", platform: "windows", enabled: false, last_seen: null },
  ],
};

Deno.test("prompt cites live rows, never filler", () => {
  const p = buildDirectorSystemPrompt(CTX);
  check(p.includes("Pharmacy") && p.includes("stock 2"), "operator row cited");
  check(p.includes("v3") && p.includes("owner_revert"), "version cited");
  check(p.includes("Stock setup"), "thread cited");
  check(p.includes("Gmail"), "dead connector cited");
  check(p.includes("abcd1234") && p.includes("gateway_timeout"), "failed job identity cited, never hidden");
  check(p.includes("NEVER approve"), "approval boundary stated");
  check(p.includes("Morning review"), "past chats remembered");
  check(p.includes("Re-queued failed plan"), "own recent work reported");
  check(p.includes("Plan failed: Pharmacy"), "unread notifications raised");
  check(p.includes("ATTENTION: 3 things"), "attention total stated");
  check(p.includes("products 4"), "product count cited");
  check(p.includes("0 products has no stock"), "stock-awareness rule stated");
  check(p.includes("Office PC") && p.includes("dev-1"), "paired devices listed with ids");
  check(p.includes("Old laptop") && p.includes("PAUSED"), "paused devices flagged");
  check(p.includes("STRICT JSON"), "contract stated");
});

Deno.test("empty context is explicit, not invented", () => {
  const p = buildDirectorSystemPrompt({
    operators: [], versions: [], threads: [], failedJobs: 0, failedJobDetails: [],
    activeJobs: 0, connectorsDown: [], attentionTotal: 0,
    pastChats: [], recentWork: [], unreadNotifications: [],
    devices: [],
    ownerId: "owner-1",
  });
  check(p.includes("No operators yet"), "emptiness stated");
  check(!p.includes("Pharmacy"), "nothing invented");
});

Deno.test("replies parse strictly, junk fails loud", () => {
  const good = parseDirectorReply('```json\n{"reply":"Hi there.","suggestions":["a"],"actions":[{"type":"navigate","path":"/console"}]}\n```');
  check(good.reply === "Hi there.", "fences tolerated");
  check(good.suggestions.length === 1 && good.actions.length === 1, "fields kept");
  const trimmed = parseDirectorReply(JSON.stringify({
    reply: "x", suggestions: ["a", "b", "c", "d", "e"],
    actions: [{ type: "navigate", path: "/x" }, { type: "hack" }, null, "y", { type: "say" }],
  }));
  check(trimmed.suggestions.length === 3, "suggestions capped");
  check(trimmed.actions.length === 1, "only known actions survive");
  let threw = false;
  try {
    parseDirectorReply(JSON.stringify({ suggestions: [] }));
  } catch {
    threw = true;
  }
  check(threw, "missing reply fails loud");
});

Deno.test("research actions survive the contract with need intact", () => {
  const parsed = parseDirectorReply(JSON.stringify({
    reply: "Looking into it.",
    suggestions: [],
    actions: [{ type: "research_need", need: "tiktok-auto-post" }, { type: "teleport" }],
  }));
  check(parsed.actions.length === 1, "research kept, junk dropped");
  check((parsed.actions[0] as { need?: string }).need === "tiktok-auto-post", "need preserved for the resolver");
});


Deno.test("route list is generated from OWNER_PAGES, never hand-written", async () => {
  const { OWNER_PAGES } = await import("./surfaceManifest.ts");
  const p = buildDirectorSystemPrompt(CTX);
  for (const page of OWNER_PAGES) {
    check(p.includes(page.route), `manifest route listed: ${page.route}`);
  }
  check(!p.includes("/orders ") && !p.includes("/orders,"), "invented /orders route gone");
  check(!p.includes("/builder ") && !p.includes("/builder,"), "invented /builder route gone");
});

Deno.test("hands and companion sections teach the loop and the iron rule", () => {
  const p = buildDirectorSystemPrompt(CTX);
  check(p.includes("director-tools"), "tools endpoint named");
  check(p.includes("look, act ONCE, read the result"), "loop discipline stated");
  check(p.includes("device_id"), "companion routing documented");
  check(p.includes("ONLY when the owner asked in this"), "ask-gate for real computers");
  check(p.includes("never instruction"), "screen-text rule stated");
});

Deno.test("runner section teaches run_cli with the iron rule doubled", () => {
  const p = buildDirectorSystemPrompt(CTX);
  check(p.includes("run_cli"), "shell tool named");
  check(p.includes("never rephrase a refused command"), "refusal-dodging banned");
});

Deno.test("one-tap connect and web reading are taught", () => {
  const p = buildDirectorSystemPrompt(CTX);
  check(p.includes("connect_start"), "connect action documented");
  check(p.includes("browse_url"), "browse tool documented");
  const parsed = parseDirectorReply(JSON.stringify({
    reply: "Connecting now.",
    suggestions: [],
    actions: [{ type: "connect_start", connector_key: "google_reviews" }],
  }));
  check(parsed.actions.length === 1, "connect_start survives the contract");
});

Deno.test("cursor visibility and platform coverage are stated", () => {
  const p = buildDirectorSystemPrompt(CTX);
  check(p.includes("visible cursor"), "brain knows its in-app work is watched");
  check(p.includes("cannot touch browser chrome"), "cursor boundary stated");
  check(p.includes("NO iOS companion"), "iOS gap stated, never promised");
  check(p.includes("paired\" is not \"awake"), "paired-vs-awake distinction stated");
  check(p.includes("never checked in"), "never-seen rule stated");
});

Deno.test("browser lane is taught with verification discipline", () => {
  const p = buildDirectorSystemPrompt(CTX);
  check(p.includes("browse_task"), "browser task tool named");
  check(p.includes("DONE claim is never"), "done-is-not-proof rule stated");
  check(p.includes("never go to the lane"), "login/payment boundary for lanes");
  check(p.includes("you return one strict decision"), "brain-decides-every-step stated");
  check(p.includes("by filename only, never"), "file-box rule stated");
});

Deno.test("open-world hands are taught with stale-index discipline", () => {
  const p = buildDirectorSystemPrompt(CTX);
  check(p.includes("live_click"), "live actions documented");
  check(p.includes("indexes die on navigation"), "staleness rule stated");
  check(p.includes("FRESH indexed table"), "fresh-eyes model stated");
});

Deno.test("self-driving tasks are taught with resume discipline", () => {
  const p = buildDirectorSystemPrompt(CTX);
  check(p.includes("director-task"), "task endpoint named");
  check(p.includes("never leave a running one un-polled"), "resume discipline stated");
  check(p.includes("never blind-retries a refused action"), "no-retry rule stated");
});

Deno.test("hands actions validate steps strictly or drop whole", () => {
  const good = parseDirectorReply(JSON.stringify({
    reply: "On it.",
    suggestions: [],
    actions: [{ type: "hands", steps: [
      { op: "click", target: "console-stock-check" },
      { op: "goto", route: "/console" },
      { op: "type", target: "console-chat-input", text: "hi" },
    ] }],
  }));
  check(good.actions.length === 1, "well-formed hands survives");
  const goodGesture = parseDirectorReply(JSON.stringify({
    reply: "Watch this.",
    suggestions: [],
    actions: [{ type: "hands", steps: [
      { op: "gesture", kind: "oscillate", target: "director-cursor-home", amplitude: 24, cycles: 2 },
      { op: "gesture", kind: "pause", ms: 600 },
    ] }],
  }));
  check(goodGesture.actions.length === 1, "well-formed gesture steps survive");
  const cases: Array<[unknown, string]> = [
    [{ type: "hands", steps: [] }, "empty steps"],
    [{ type: "hands", steps: [{ op: "click", target: "a" }, { op: "click", target: "b" }, { op: "click", target: "c" }, { op: "click", target: "d" }] }, "four steps"],
    [{ type: "hands", steps: [{ op: "teleport", target: "x" }] }, "unknown op"],
    [{ type: "hands", steps: [{ op: "click" }] }, "click without target"],
    [{ type: "hands", steps: [{ op: "goto" }] }, "goto without route"],
    [{ type: "hands", steps: [{ op: "type", target: "x" }] }, "type without text"],
    [{ type: "hands", steps: [{ op: "drag", from: "a" }] }, "drag without to"],
    [{ type: "hands", steps: [{ op: "gesture", target: "a" }] }, "gesture without kind"],
    [{ type: "hands", steps: [{ op: "gesture", kind: "teleport", target: "a" }] }, "gesture unknown kind"],
    [{ type: "hands", steps: [{ op: "gesture", kind: "oscillate" }] }, "gesture without anchor"],
    [{ type: "hands", steps: [{ op: "gesture", kind: "pause", target: "a" }] }, "pause with anchor"],
    [{ type: "hands", steps: "click" }, "non-array steps"],
    [{ type: "hands" }, "missing steps"],
  ];
  for (const [action, why] of cases) {
    const parsed = parseDirectorReply(JSON.stringify({ reply: "x", suggestions: [], actions: [action] }));
    check(parsed.actions.length === 0, `dropped whole: ${why}`);
  }
});
