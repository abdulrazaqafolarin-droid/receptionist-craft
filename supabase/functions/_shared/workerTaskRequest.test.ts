import { isBoundedApprovalId, parseWorkerTaskCreateRequest } from "./workerTaskRequest.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const valid = {
  worker_id: "11111111-1111-4111-8111-111111111111",
  title: "Prepare a source-backed market brief",
  goal: "Research the approved market and return a report with source references.",
  input_json: { market: "home services", region: "Nigeria" },
  idempotency_key: "market-brief-2026-01",
};

Deno.test("accepts bounded task requests and normalizes title and goal", () => {
  const parsed = parseWorkerTaskCreateRequest({ ...valid, title: "  Brief  ", goal: "  Research  " });
  assert(parsed.ok, "valid task should parse");
  if (parsed.ok) {
    assert(parsed.value.title === "Brief", "title is trimmed");
    assert(parsed.value.goal === "Research", "goal is trimmed");
    assert(Object.keys(parsed.value.input_json).length === 2, "input is preserved");
  }
});

Deno.test("requires a valid worker id, goal, title, and idempotency key", () => {
  assert(!parseWorkerTaskCreateRequest({ ...valid, worker_id: "not-a-uuid" }).ok, "bad worker ID rejected");
  assert(!parseWorkerTaskCreateRequest({ ...valid, title: " " }).ok, "blank title rejected");
  assert(!parseWorkerTaskCreateRequest({ ...valid, goal: " " }).ok, "blank goal rejected");
  assert(!parseWorkerTaskCreateRequest({ ...valid, idempotency_key: "x" }).ok, "short idempotency key rejected");
});

Deno.test("rejects scalar input, oversized payloads and secret-like values", () => {
  assert(!parseWorkerTaskCreateRequest({ ...valid, input_json: ["not", "an", "object"] }).ok, "array input rejected");
  assert(!parseWorkerTaskCreateRequest({ ...valid, input_json: { blob: "x".repeat(33000) } }).ok, "oversized input rejected");
  const token = ["ghp", "abcdefghijklmnopqrstuvwxyz0123456789"].join("_");
  assert(!parseWorkerTaskCreateRequest({ ...valid, input_json: { note: token } }).ok, "token-like input rejected");
  assert(!parseWorkerTaskCreateRequest({ ...valid, goal: "Use Bearer abcdefghijklmnopqrstuvwxyz0123456789" }).ok, "credential-like goal rejected");
});

Deno.test("approval IDs are bounded opaque references", () => {
  assert(isBoundedApprovalId("approval-1234"), "bounded ID accepted");
  assert(!isBoundedApprovalId("short"), "short ID rejected");
  assert(!isBoundedApprovalId("x".repeat(129)), "long ID rejected");
});
