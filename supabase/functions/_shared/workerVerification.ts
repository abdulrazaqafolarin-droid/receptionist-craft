import type { WorkerDefinition } from "./workerContract.ts";

const SAFE_ACTIONS = new Set(["research", "internal_read", "draft"]);

export function draftPublicationBlockReason(definition: WorkerDefinition): string | null {
  if (!definition.allowed_actions.includes("draft")) return "draft_action_not_allowed";
  if (definition.allowed_actions.some((action) => !SAFE_ACTIONS.has(action))) return "unsupported_actions";
  if (definition.capability_keys.length > 0) return "unsupported_capabilities";
  if (definition.outputs.some((field) => field.type === "file")) return "file_outputs_not_supported";
  if (definition.inputs.some((field) => field.required && field.type === "file")) return "required_file_inputs_not_supported";
  if (definition.autonomy_mode !== "supervised") return "supervised_mode_required";
  return null;
}

export function makeVerificationPayload(definition: WorkerDefinition): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of definition.inputs) {
    if (!field.required) continue;
    if (field.type === "file") throw new Error("required_file_inputs_not_supported");
    if (field.type === "text") payload[field.key] = "Synthetic verification input; not real business data.";
    else if (field.type === "number") payload[field.key] = 1;
    else if (field.type === "boolean") payload[field.key] = true;
    else if (field.type === "date") payload[field.key] = "2026-01-15";
    else payload[field.key] = { verification_sample: true };
  }
  return payload;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, stableValue(record[key])]));
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export async function hashWorkerDefinition(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stableStringify(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
