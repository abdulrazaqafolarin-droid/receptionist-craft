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
  operators: [{
    id: "op-1", display: "Pharmacy", kind: "ops", model: "internal",
    active: true, upcomingBookings: 0, openEscalations: 0, stockNeeds: 2, overdueTasks: 1,
  }],
  versions: [{ operator: "Pharmacy", version_number: 3, change_source: "owner_revert", owner_input: "back to v2", created_at: "2026-10-01T00:00:00Z" }],
  threads: [{ title: "Stock setup", status: "approved", receptionist_name: "Pharmacy", updated_at: "2026-10-02T00:00:00Z" }],
  failedJobs: 1,
  failedJobDetails: [{ job_id: "abcd1234-efgh", operator: "Pharmacy", error: "gateway_timeout", created_at: "2026-10-07T00:00:00Z" }],
  activeJobs: 0,
  connectorsDown: ["Gmail"],
  attentionTotal: 3,
};

Deno.test("prompt cites live rows, never filler", () => {
  const p = buildDirectorSystemPrompt(CTX);
  check(p.includes("Pharmacy") && p.includes("stock 2"), "operator row cited");
  check(p.includes("v3") && p.includes("owner_revert"), "version cited");
  check(p.includes("Stock setup"), "thread cited");
  check(p.includes("Gmail"), "dead connector cited");
  check(p.includes("abcd1234") && p.includes("gateway_timeout"), "failed job identity cited, never hidden");
  check(p.includes("NEVER approve"), "approval boundary stated");
  check(p.includes("STRICT JSON"), "contract stated");
});

Deno.test("empty context is explicit, not invented", () => {
  const p = buildDirectorSystemPrompt({
    operators: [], versions: [], threads: [], failedJobs: 0, failedJobDetails: [],
    activeJobs: 0, connectorsDown: [], attentionTotal: 0,
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

Deno.test("guide steps validate through the actor validator", () => {
  const parsed = parseDirectorReply(JSON.stringify({
    reply: "Watch this.",
    suggestions: [],
    actions: [{
      type: "guide",
      steps: [
        { type: "point", target: "console-stock-check", say: "Look here." },
        { type: "click", target: "no-such-panel" },
        { type: "teleport", target: "console-stock-check" },
      ],
    }],
  }));
  check(parsed.actions.length === 1, "guide survives with valid steps");
  const steps = (parsed.actions[0] as { steps?: unknown[] }).steps || [];
  check(steps.length === 1, "bad steps stripped inside the guide");
});

Deno.test("guide clicks on registered buttons survive validation", () => {
  const parsed = parseDirectorReply(JSON.stringify({
    reply: "Clicking it now.",
    suggestions: [],
    actions: [{
      type: "guide",
      steps: [
        { type: "click", target: "console-stock-check" },
        { type: "click", target: "mystery-button" },
      ],
    }],
  }));
  const steps = (parsed.actions[0] as { steps?: Array<{ type?: string }> }).steps || [];
  check(steps.length === 1 && steps[0].type === "click", "registered click kept, ghost click dropped");
});
