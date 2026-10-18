import { parseWorkerDefinition, type WorkerDefinition } from "./workerContract.ts";
import { buildDraftPrompt, parseDraftModelOutput, validateDraftTaskInput } from "./workerDraftExecution.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function definition(): WorkerDefinition {
  return {
    schema_version: 1,
    purpose: "Prepare a draft response using only supplied business information.",
    responsibilities: ["Draft text", "Flag missing information"],
    inputs: [{ key: "request", label: "Draft request", type: "text", required: true }],
    outputs: [{ key: "result", label: "Draft result", type: "text", required: true }],
    capability_keys: [],
    allowed_actions: ["draft"],
    approval_required_for: ["external_write", "send_message", "publish", "purchase", "payment", "delete", "permission_change", "data_export"],
    autonomy_mode: "supervised",
    execution: { max_steps: 5, timeout_seconds: 90, max_retries: 0 },
    verification: { success_criteria: ["Return a useful draft and flag missing facts"], require_evidence: true },
    workspace: { layout: "task_board", panels: ["tasks", "outputs"] },
  };
}

Deno.test("accepts a draft-only task with the declared required input", () => {
  const result = validateDraftTaskInput(definition(), {
    goal: "Draft a polite appointment reminder",
    input_json: { execution_mode: "draft", payload: { request: "Reminder for tomorrow at 10 AM" } },
  });
  assert(result.ok, "valid draft request should pass");
  if (result.ok) assert(result.payload.request === "Reminder for tomorrow at 10 AM", "payload is preserved");
});

Deno.test("blocks external actions, undeclared capabilities and unsupported modes", () => {
  const task = { goal: "Draft a message", input_json: { execution_mode: "draft", payload: { request: "Hello" } } };
  assert(!validateDraftTaskInput(definition(), { ...task, goal: "Send a message to the customer" }).ok, "send intent blocked");
  assert(!validateDraftTaskInput(definition(), { ...task, input_json: { execution_mode: "execute", payload: { request: "Hello" } } }).ok, "non-draft mode blocked");
  const withCapability = { ...definition(), capability_keys: ["email.send"] };
  assert(!validateDraftTaskInput(withCapability, task).ok, "external capability blocked");
  const withUnsafeAction = { ...definition(), allowed_actions: ["draft", "send_message"] } as WorkerDefinition;
  assert(!validateDraftTaskInput(withUnsafeAction, task).ok, "consequential action worker blocked");
});

Deno.test("validates declared input and rejects credential-like data", () => {
  assert(!validateDraftTaskInput(definition(), {
    goal: "Draft a reply",
    input_json: { execution_mode: "draft", payload: {} },
  }).ok, "required input must be present");
  const credential = ["ghp", "abcdefghijklmnopqrstuvwxyz0123456789"].join("_");
  assert(!validateDraftTaskInput(definition(), {
    goal: "Draft a reply",
    input_json: { execution_mode: "draft", payload: { request: credential } },
  }).ok, "credential-like payload blocked");
});

Deno.test("parses strict JSON and validates output schema", () => {
  const parsed = parseDraftModelOutput(
    JSON.stringify({ values: { result: "Hello [NEEDS NAME]" }, notes: ["Business name was not supplied."] }),
    definition(),
  );
  assert(parsed.ok, "valid draft output should pass");
  if (parsed.ok) assert(parsed.values.result === "Hello [NEEDS NAME]", "declared result returned");

  assert(!parseDraftModelOutput("Here is the draft", definition()).ok, "plain prose instead of JSON rejected");
  assert(!parseDraftModelOutput(JSON.stringify({ values: {}, notes: [] }), definition()).ok, "missing required output rejected");
  assert(!parseDraftModelOutput(JSON.stringify({ values: { result: 42 }, notes: [] }), definition()).ok, "wrong output type rejected");
  assert(!parseDraftModelOutput(JSON.stringify({ values: { result: "Use Bearer abcdefghijklmnopqrstuvwxyz0123456789" }, notes: [] }), definition()).ok, "credential-like output rejected");
});

Deno.test("prompt explicitly confines execution to drafting without tools", () => {
  const def = definition();
  const prompt = buildDraftPrompt(def, {
    goal: "Draft a short reminder",
    input_json: { execution_mode: "draft", payload: { request: "Reminder text" } },
  }, { request: "Reminder text" });
  assert(prompt.includes("NO tools"), "tool access explicitly excluded");
  assert(prompt.includes("Never claim that a message was sent"), "side-effect claims forbidden");
  assert(prompt.includes("untrusted reference data"), "payload treated as untrusted data");
});
