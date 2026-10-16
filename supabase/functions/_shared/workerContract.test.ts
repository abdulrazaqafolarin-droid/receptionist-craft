import { parseWorkerDefinition, CONSEQUENTIAL_ACTIONS, type WorkerDefinition } from "./workerContract.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function validDefinition(): WorkerDefinition {
  return {
    schema_version: 1,
    purpose: "Research a business process and prepare a verified internal report.",
    responsibilities: ["Gather approved source material", "Summarize findings with citations"],
    inputs: [{ key: "topic", label: "Research topic", type: "text", required: true }],
    outputs: [{ key: "report", label: "Research report", type: "text", required: true }],
    capability_keys: ["web.search"],
    allowed_actions: ["research", "internal_read", "draft", ...CONSEQUENTIAL_ACTIONS],
    approval_required_for: [...CONSEQUENTIAL_ACTIONS],
    autonomy_mode: "bounded_autonomy",
    execution: { max_steps: 20, timeout_seconds: 300, max_retries: 2 },
    verification: { success_criteria: ["Report contains source-backed findings"], require_evidence: true },
    workspace: { layout: "research", panels: ["tasks", "sources", "outputs"] },
  };
}

Deno.test("accepts a valid versioned worker definition", () => {
  const result = parseWorkerDefinition(validDefinition());
  assert(result.ok, "valid worker definition should parse");
  if (result.ok) {
    assert(result.value.schema_version === 1, "schema version preserved");
    assert(result.value.verification.require_evidence, "evidence remains required");
  }
});

Deno.test("rejects consequential actions without explicit approval rules", () => {
  const definition = validDefinition();
  definition.approval_required_for = ["payment", "delete"];
  const result = parseWorkerDefinition(definition);
  assert(!result.ok, "missing approval rules should reject the definition");
  if (!result.ok) {
    assert(
      result.errors.some((e) => e.code === "missing_consequential_approval"),
      "reports missing consequential approval rule",
    );
  }
});

Deno.test("rejects unsupported schema versions and unknown keys", () => {
  const definition = { ...validDefinition(), schema_version: 2, hidden_admin_mode: true };
  const result = parseWorkerDefinition(definition);
  assert(!result.ok, "unknown fields and schema versions must fail closed");
  if (!result.ok) {
    assert(result.errors.some((e) => e.code === "unsupported_version"), "version error present");
    assert(result.errors.some((e) => e.code === "unknown_key"), "unknown key error present");
  }
});

Deno.test("rejects unsafe execution budgets and completion without evidence", () => {
  const definition = validDefinition();
  definition.execution.max_steps = 1000;
  definition.execution.timeout_seconds = 3600;
  definition.verification.require_evidence = false as true;
  const result = parseWorkerDefinition(definition);
  assert(!result.ok, "out-of-budget and unverified definitions must fail");
  if (!result.ok) {
    assert(result.errors.some((e) => e.path === "execution.max_steps"), "step budget checked");
    assert(result.errors.some((e) => e.path === "execution.timeout_seconds"), "timeout checked");
    assert(result.errors.some((e) => e.code === "evidence_required"), "evidence rule checked");
  }
});

Deno.test("rejects duplicate field and capability keys", () => {
  const definition = validDefinition();
  definition.inputs.push({ key: "topic", label: "Another topic", type: "text", required: false });
  definition.capability_keys.push("web.search");
  const result = parseWorkerDefinition(definition);
  assert(!result.ok, "duplicate keys should fail");
  if (!result.ok) {
    assert(result.errors.some((e) => e.code === "duplicate_key"), "duplicate field key detected");
    assert(result.errors.some((e) => e.code === "duplicate_capability"), "duplicate capability detected");
  }
});

Deno.test("rejects unsupported actions instead of trusting model output", () => {
  const definition = validDefinition() as WorkerDefinition & { allowed_actions: string[] };
  definition.allowed_actions.push("shell_as_root");
  const result = parseWorkerDefinition(definition);
  assert(!result.ok, "unknown action must fail closed");
  if (!result.ok) {
    assert(result.errors.some((e) => e.code === "unsupported_action"), "unsupported action is reported");
  }
});
