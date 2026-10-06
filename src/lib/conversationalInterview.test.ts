/**
 * Phase B golden test: problem-type detection + question routing.
 *
 * The contract: an ops problem must never be asked a booking/content
 * question, a front-desk problem must keep its booking track, and the
 * detected type must survive onto the plan config. Pure functions only —
 * no network, runs under deno test.
 *
 * Run: deno test --unstable-sloppy-imports src/lib/conversationalInterview.test.ts
 */

import {
  buildLocalPlan,
  detectProblemType,
  nextInterviewTurn,
} from "./conversationalInterview.ts";

// Minimal ambient so tsc (which typechecks src/) accepts the Deno runner.
// Deno provides the real global at test time.
declare const Deno: { test(name: string, fn: () => void): void };

function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

// Words that must never appear in interview questions for an ops problem.
const BOOKING_WORDS = /book|appoint|order|post|publish|tiktok|instagram|transact|deposit/i;

function runConvo(messages: string[], businessType = ""): { asked: string[]; ready: boolean; type: string | null } {
  const asked: string[] = [];
  let ready = false;
  let type: string | null = null;
  const said: string[] = [];
  for (const m of messages) {
    said.push(m);
    const turn = nextInterviewTurn(said, "", businessType);
    asked.push(turn.assistant_message);
    ready = turn.ready;
    type = turn.slots.problem_type;
  }
  return { asked, ready, type };
}

Deno.test("pharmacy ops problem: internal-ops, never a booking question", () => {
  const convo = runConvo([
    "i run a pharmacy and things are somehow anyhow inside",
    "drugs expire on the shelf and nobody counts stock",
    "me plus two assistants",
    "daily",
    "whatsapp 08031234567",
  ]);
  check(convo.type === "internal-ops", `detects internal-ops (got ${convo.type})`);
  for (const q of convo.asked) {
    check(!BOOKING_WORDS.test(q), `ops question stays in-domain: "${q.slice(0, 80)}"`);
  }
  check(convo.asked.some((q) => /keep(ing)? track/i.test(q)), "asks what to track");
  check(convo.ready === true, "ops interview reaches ready");
});

Deno.test("salon problem: front-desk, booking track intact", () => {
  const convo = runConvo(["i run a salon in lekki"]);
  check(convo.type === "front-desk", `detects front-desk (got ${convo.type})`);
  check(/transact|buy from you/i.test(convo.asked[0]), "first question is the transact question");
});

Deno.test("ops plus bookings: hybrid forces both shapes", () => {
  const turn = nextInterviewTurn(
    ["i run a pharmacy. drugs expire on the shelf and customers book consultations"],
    "", "",
  );
  check(turn.slots.problem_type === "hybrid", "detects hybrid");
  check(turn.slots.operator_kind === "both", "hybrid forces both kinds");
});

Deno.test("content helper: pre-existing track untouched", () => {
  const turn = nextInterviewTurn(["i need content ideas and captions for my skincare brand"], "", "");
  check(turn.slots.operator_kind === "assistant", "content stays assistant");
  check(turn.slots.problem_type === null, "content reports no problem_type (own axis)");
  check(/platform|posts go/i.test(turn.assistant_message), "asks the platform question");
});

Deno.test("empty transcript detects nothing", () => {
  check(detectProblemType("", "") === null, "empty input yields null");
});

Deno.test("offline draft stamps problem_type and stays honest", () => {
  const local = buildLocalPlan(
    ["i run a small pharmacy. drugs expire and nobody counts stock"],
    "", "",
  );
  check(local.config.problem_type === "internal-ops", "draft config carries problem_type");
  const will = (local.config.will_do || []) as string[];
  check(!will.some((w) => /book|order/i.test(w)), "ops draft promises no bookings or orders");
});
