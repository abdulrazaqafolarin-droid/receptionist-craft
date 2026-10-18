import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { projectWorkerTaskResponse } from "./workerTaskResponse.ts";

const task = {
  id: "task-1",
  worker_id: "worker-1",
  created_by: "user-1",
  title: "Draft",
  goal: "Prepare a draft",
  status: "blocked",
  input_json: { customer_email: "private@example.test" },
  output_json: { draft: "hello" },
  error_text: "unsupported input",
  attempt_count: 1,
  checkpoint_json: { internal: "checkpoint" },
  idempotency_key: "private-idempotency-key",
  approval_request: { secret: "approval-internal" },
  approved_by: "user-2",
  approved_at: "2026-10-18T00:00:00Z",
  cancel_requested_at: null,
  started_at: null,
  finished_at: null,
  created_at: "2026-10-18T00:00:00Z",
  updated_at: "2026-10-18T00:00:00Z",
};

Deno.test("read-only task details omit private inputs and execution internals", () => {
  const result = projectWorkerTaskResponse(task, false);
  assertEquals(result.input_json, undefined);
  assertEquals(result.checkpoint_json, undefined);
  assertEquals(result.idempotency_key, undefined);
  assertEquals(result.approval_request, undefined);
  assertEquals(result.approved_by, undefined);
  assertEquals(result.cancel_requested_at, undefined);
  assertEquals(result.output_json, task.output_json);
  assertEquals(result.status, "blocked");
});

Deno.test("editors retain full task data needed for supervised recovery", () => {
  const result = projectWorkerTaskResponse(task, true);
  assertEquals(result, task);
});
