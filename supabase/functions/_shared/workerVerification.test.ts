import { parseWorkerDefinition } from "./workerContract.ts";
import { draftPublicationBlockReason, hashWorkerDefinition, makeVerificationPayload, stableStringify } from "./workerVerification.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const draftDefinition = {
  schema_version: 1,
  purpose: "Create a draft using supplied facts only.",
  responsibilities: ["Draft content", "Identify missing inputs"],
  inputs: [{ key: "request", label: "Request", type: "text", required: true }],
  outputs: [{ key: "result", label: "Draft", type: "text", required: true }],
  capability_keys: [],
  allowed_actions: ["draft"],
  approval_required_for: ["external_write", "send_message", "publish", "purchase", "payment", "delete", "permission_change", "data_export"],
  autonomy_mode: "supervised",
  execution: { max_steps: 5, timeout_seconds: 90, max_retries: 0 },
  verification: { success_criteria: ["Return a useful draft"], require_evidence: true },
  workspace: { layout: "task_board", panels: ["tasks", "outputs"] },
};

Deno.test("allows only supervised draft-safe definitions to publish on this runner", () => {
  const parsed = parseWorkerDefinition(draftDefinition);
  assert(parsed.ok, "sample definition should pass contract");
  if (!parsed.ok) return;
  assert(draftPublicationBlockReason(parsed.value) === null, "safe draft definition is publishable");

  const unsafe = parseWorkerDefinition({ ...draftDefinition, allowed_actions: ["draft", "send_message"] });
  assert(unsafe.ok, "consequential action can be a valid definition");
  if (unsafe.ok) assert(draftPublicationBlockReason(unsafe.value) === "unsupported_actions", "external actions must be blocked");
  const research = parseWorkerDefinition({ ...draftDefinition, allowed_actions: ["draft", "research"] });
  assert(research.ok, "research action can be a valid definition");
  if (research.ok) assert(draftPublicationBlockReason(research.value) === "unsupported_actions", "research must remain unpublished until a research adapter exists");

  const internalRead = parseWorkerDefinition({ ...draftDefinition, allowed_actions: ["draft", "internal_read"] });
  assert(internalRead.ok, "internal read action can be a valid definition");
  if (internalRead.ok) assert(draftPublicationBlockReason(internalRead.value) === "unsupported_actions", "internal reads must remain unpublished until a verified adapter exists");
});

Deno.test("builds synthetic required input values and rejects required files", () => {
  const parsed = parseWorkerDefinition(draftDefinition);
  assert(parsed.ok, "definition should parse");
  if (parsed.ok) {
    const payload = makeVerificationPayload(parsed.value);
    assert(payload.request === "Synthetic verification input; not real business data.", "text input must be synthetic");
  }
  const fileDefinition = parseWorkerDefinition({
    ...draftDefinition,
    inputs: [{ key: "document", label: "Document", type: "file", required: true }],
  });
  assert(fileDefinition.ok, "file input definition is contract-valid");
  if (fileDefinition.ok) {
    let rejected = false;
    try { makeVerificationPayload(fileDefinition.value); } catch { rejected = true; }
    assert(rejected, "required file input is not supported by draft runner");
  }
});

Deno.test("definition fingerprint is deterministic across object key ordering", async () => {
  assert(stableStringify({ b: 2, a: { z: 1, c: 3 } }) === stableStringify({ a: { c: 3, z: 1 }, b: 2 }), "stable stringify sorts object keys");
  const first = await hashWorkerDefinition({ b: 2, a: 1 });
  const second = await hashWorkerDefinition({ a: 1, b: 2 });
  assert(first === second && /^[0-9a-f]{64}$/.test(first), "definition hash must be stable SHA-256");
});
