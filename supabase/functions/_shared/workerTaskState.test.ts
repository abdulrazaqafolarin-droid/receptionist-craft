import { canTransitionWorkerTask, type CompletionEvidence } from "./workerTaskState.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const evidence: CompletionEvidence[] = [
  { kind: "verification", summary: "Output matched the required schema." },
];

Deno.test("queued tasks can only start when their worker is active", () => {
  assert(!canTransitionWorkerTask("queued", "running").ok, "inactive worker must not start");
  assert(canTransitionWorkerTask("queued", "running", { workerActive: true }).ok, "active worker can start");
});

Deno.test("completion requires bounded structured evidence", () => {
  assert(!canTransitionWorkerTask("running", "done").ok, "model claim alone cannot complete task");
  assert(!canTransitionWorkerTask("running", "done", { completionEvidence: [] }).ok, "empty evidence is rejected");
  assert(!canTransitionWorkerTask("running", "done", {
    completionEvidence: [{ kind: "verification", summary: "x".repeat(1001) }],
  }).ok, "oversized evidence is rejected");
  assert(canTransitionWorkerTask("running", "done", { completionEvidence: evidence }).ok, "verified output can complete");
});

Deno.test("approval gates the return to queued execution", () => {
  assert(!canTransitionWorkerTask("waiting_approval", "queued").ok, "approval is required");
  assert(canTransitionWorkerTask("waiting_approval", "queued", { approvalGranted: true }).ok, "approved work can resume");
  assert(!canTransitionWorkerTask("waiting_approval", "running", { approvalGranted: true }).ok, "approval must re-enter queue before a fresh claim");
});

Deno.test("unknown outcomes cannot be blindly retried", () => {
  assert(!canTransitionWorkerTask("running", "queued", { retryable: false, attemptCount: 1, maxRetries: 2 }).ok, "unknown outcome must not retry");
  assert(!canTransitionWorkerTask("running", "queued", { retryable: true, attemptCount: 3, maxRetries: 2 }).ok, "retry budget is enforced");
  assert(canTransitionWorkerTask("running", "queued", { retryable: true, attemptCount: 1, maxRetries: 2 }).ok, "known safe retry may requeue");
});

Deno.test("blocked tasks require resolution and running cancellation requires a stopped executor", () => {
  assert(!canTransitionWorkerTask("blocked", "queued").ok, "blocked task cannot resume by default");
  assert(canTransitionWorkerTask("blocked", "queued", { unblocked: true }).ok, "resolved block can resume");
  assert(!canTransitionWorkerTask("running", "cancelled").ok, "cannot mark in-flight execution cancelled");
  assert(canTransitionWorkerTask("running", "cancelled", { executionStopped: true }).ok, "stopped execution can be cancelled");
});

Deno.test("terminal states cannot be reopened", () => {
  assert(!canTransitionWorkerTask("done", "queued", { retryable: true }).ok, "done is terminal");
  assert(!canTransitionWorkerTask("cancelled", "queued").ok, "cancelled is terminal");
  assert(!canTransitionWorkerTask("running", "running").ok, "same-state updates are not transitions");
});
