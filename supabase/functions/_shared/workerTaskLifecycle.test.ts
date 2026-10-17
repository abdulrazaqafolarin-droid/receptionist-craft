import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { gateWorkerAction, transitionWorkerTask } from "./workerTaskLifecycle.ts";

Deno.test("queued task can start or be cancelled only", () => {
  assertEquals(transitionWorkerTask({ status: "queued", event: "start" }), { ok: true, status: "running" });
  assertEquals(transitionWorkerTask({ status: "queued", event: "cancel" }), { ok: true, status: "cancelled" });
  assertEquals(transitionWorkerTask({ status: "queued", event: "complete" }), { ok: false, error: "event_not_allowed_from_queued" });
});

Deno.test("completion requires independent verification and evidence", () => {
  assertEquals(transitionWorkerTask({ status: "running", event: "complete", verificationPassed: false, evidenceCount: 1 }), { ok: false, error: "verification_not_passed" });
  assertEquals(transitionWorkerTask({ status: "running", event: "complete", verificationPassed: true, evidenceCount: 0 }), { ok: false, error: "completion_evidence_required" });
  assertEquals(transitionWorkerTask({ status: "running", event: "complete", verificationPassed: true, evidenceCount: 2 }), { ok: true, status: "done" });
});

Deno.test("approval pauses execution and approval resumes through the queue", () => {
  assertEquals(transitionWorkerTask({ status: "running", event: "request_approval" }), { ok: true, status: "waiting_approval" });
  assertEquals(transitionWorkerTask({ status: "waiting_approval", event: "approve" }), { ok: true, status: "queued" });
  assertEquals(transitionWorkerTask({ status: "waiting_approval", event: "reject" }), { ok: true, status: "blocked" });
});

Deno.test("terminal tasks cannot be reopened", () => {
  assertEquals(transitionWorkerTask({ status: "done", event: "retry", retryCount: 0, maxRetries: 2, retryIsSafe: true }), { ok: false, error: "task_is_terminal" });
  assertEquals(transitionWorkerTask({ status: "cancelled", event: "start" }), { ok: false, error: "task_is_terminal" });
});

Deno.test("retry is explicit, bounded, and only permitted when safe", () => {
  assertEquals(transitionWorkerTask({ status: "failed", event: "retry", retryCount: 0, maxRetries: 2, retryIsSafe: false }), { ok: false, error: "retry_safety_not_confirmed" });
  assertEquals(transitionWorkerTask({ status: "failed", event: "retry", retryCount: 2, maxRetries: 2, retryIsSafe: true }), { ok: false, error: "retry_budget_exhausted" });
  assertEquals(transitionWorkerTask({ status: "blocked", event: "retry", retryCount: 1, maxRetries: 3, retryIsSafe: true }), { ok: true, status: "queued" });
});

Deno.test("consequential actions always require explicit approval", () => {
  const input = {
    action: "send_message",
    allowedActions: ["send_message"],
    approvalRequiredFor: [],
    autonomyMode: "bounded_autonomy" as const,
  };
  assertEquals(gateWorkerAction(input), { ok: false, error: "approval_required" });
  assertEquals(gateWorkerAction({ ...input, approvalGranted: true }), { ok: true, approvalRequired: true });
});

Deno.test("unlisted capabilities are denied even if an approval flag is present", () => {
  assertEquals(gateWorkerAction({
    action: "payment",
    allowedActions: ["research"],
    approvalRequiredFor: ["payment"],
    approvalGranted: true,
    autonomyMode: "bounded_autonomy",
  }), { ok: false, error: "action_not_allowed" });
});

Deno.test("ordinary allowed actions do not require approval unless the definition says so", () => {
  assertEquals(gateWorkerAction({
    action: "research",
    allowedActions: ["research"],
    approvalRequiredFor: [],
    autonomyMode: "supervised",
  }), { ok: true, approvalRequired: false });
  assertEquals(gateWorkerAction({
    action: "research",
    allowedActions: ["research"],
    approvalRequiredFor: ["research"],
    autonomyMode: "supervised",
  }), { ok: false, error: "approval_required" });
});
