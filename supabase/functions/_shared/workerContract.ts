/**
 * General-purpose AI Worker definition contract.
 *
 * Pure validation only: no database, network, or model calls. This is the
 * boundary between Director-generated worker specs and trusted persistence.
 * Keep it Deno-safe so the Edge Function runtime can use it directly.
 */

export const WORKER_DEFINITION_SCHEMA_VERSION = 1 as const;

export const CONSEQUENTIAL_ACTIONS = [
  "external_write",
  "send_message",
  "publish",
  "purchase",
  "payment",
  "delete",
  "permission_change",
  "data_export",
] as const;

export const WORKER_ACTIONS = [
  "research",
  "internal_read",
  "draft",
  ...CONSEQUENTIAL_ACTIONS,
] as const;

export type WorkerAction = typeof WORKER_ACTIONS[number];
export type WorkerFieldType = "text" | "number" | "boolean" | "date" | "json" | "file";
export type WorkerWorkspaceLayout = "task_board" | "research" | "operations" | "custom";
export type WorkerAutonomyMode = "supervised" | "bounded_autonomy";

export interface WorkerField {
  key: string;
  label: string;
  type: WorkerFieldType;
  required: boolean;
  description?: string;
}

export interface WorkerDefinition {
  schema_version: typeof WORKER_DEFINITION_SCHEMA_VERSION;
  purpose: string;
  responsibilities: string[];
  inputs: WorkerField[];
  outputs: WorkerField[];
  capability_keys: string[];
  allowed_actions: WorkerAction[];
  approval_required_for: string[];
  autonomy_mode: WorkerAutonomyMode;
  execution: {
    max_steps: number;
    timeout_seconds: number;
    max_retries: number;
  };
  verification: {
    success_criteria: string[];
    require_evidence: true;
  };
  workspace: {
    layout: WorkerWorkspaceLayout;
    panels: string[];
  };
}

export interface WorkerDefinitionIssue {
  path: string;
  code: string;
  message: string;
}

export type WorkerDefinitionParseResult =
  | { ok: true; value: WorkerDefinition }
  | { ok: false; errors: WorkerDefinitionIssue[] };

const FIELD_TYPES = new Set<WorkerFieldType>(["text", "number", "boolean", "date", "json", "file"]);
const WORKSPACE_LAYOUTS = new Set<WorkerWorkspaceLayout>(["task_board", "research", "operations", "custom"]);
const AUTONOMY_MODES = new Set<WorkerAutonomyMode>(["supervised", "bounded_autonomy"]);
const ACTIONS = new Set<string>(WORKER_ACTIONS);
const KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const CAPABILITY_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,99}$/;
const CONSEQUENTIALLY_REQUIRED = new Set<string>(CONSEQUENTIAL_ACTIONS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const SECRET_LIKE_PATTERNS = [
  /sk_(?:live|test)_[A-Za-z0-9]{12,}/,
  /sk-(?:proj-)?[A-Za-z0-9_-]{24,}/,
  /AIza[0-9A-Za-z_-]{30,}/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /Bearer\s+[A-Za-z0-9._~+/-]{24,}/i,
];

function containsSecretLikeValue(value: unknown): boolean {
  if (typeof value === "string") return SECRET_LIKE_PATTERNS.some((pattern) => pattern.test(value));
  if (Array.isArray(value)) return value.some(containsSecretLikeValue);
  if (isRecord(value)) return Object.values(value).some(containsSecretLikeValue);
  return false;
}

function addIssue(errors: WorkerDefinitionIssue[], path: string, code: string, message: string): void {
  errors.push({ path, code, message });
}

function checkKeys(
  value: Record<string, unknown>,
  allowed: string[],
  path: string,
  errors: WorkerDefinitionIssue[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) addIssue(errors, path ? `${path}.${key}` : key, "unknown_key", "Unknown field for this schema version.");
  }
}

function checkString(
  value: unknown,
  path: string,
  min: number,
  max: number,
  errors: WorkerDefinitionIssue[],
): value is string {
  if (typeof value !== "string") {
    addIssue(errors, path, "invalid_type", "Expected a string.");
    return false;
  }
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    addIssue(errors, path, "invalid_length", `Expected ${min} to ${max} characters after trimming.`);
    return false;
  }
  return true;
}

function checkStringList(
  value: unknown,
  path: string,
  minItems: number,
  maxItems: number,
  itemMax: number,
  errors: WorkerDefinitionIssue[],
): value is string[] {
  if (!Array.isArray(value)) {
    addIssue(errors, path, "invalid_type", "Expected an array of strings.");
    return false;
  }
  if (value.length < minItems || value.length > maxItems) {
    addIssue(errors, path, "invalid_count", `Expected ${minItems} to ${maxItems} items.`);
  }
  value.forEach((item, index) => {
    if (typeof item !== "string" || item.trim().length === 0 || item.trim().length > itemMax) {
      addIssue(errors, `${path}[${index}]`, "invalid_item", `Each item must be a non-empty string of at most ${itemMax} characters.`);
    }
  });
  return value.every((item) => typeof item === "string" && item.trim().length > 0 && item.trim().length <= itemMax);
}

function validateFields(value: unknown, path: string, errors: WorkerDefinitionIssue[]): value is WorkerField[] {
  if (!Array.isArray(value)) {
    addIssue(errors, path, "invalid_type", "Expected an array of field definitions.");
    return false;
  }
  if (value.length > 40) addIssue(errors, path, "invalid_count", "A worker may define at most 40 fields per input/output group.");

  const seen = new Set<string>();
  value.forEach((field, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(field)) {
      addIssue(errors, itemPath, "invalid_type", "Expected a field object.");
      return;
    }
    checkKeys(field, ["key", "label", "type", "required", "description"], itemPath, errors);
    if (checkString(field.key, `${itemPath}.key`, 1, 64, errors) && !KEY_PATTERN.test(field.key)) {
      addIssue(errors, `${itemPath}.key`, "invalid_key", "Use lowercase letters, numbers and underscores; start with a letter.");
    }
    if (typeof field.key === "string") {
      if (seen.has(field.key)) addIssue(errors, `${itemPath}.key`, "duplicate_key", "Field keys must be unique within this group.");
      seen.add(field.key);
    }
    checkString(field.label, `${itemPath}.label`, 1, 120, errors);
    if (typeof field.type !== "string" || !FIELD_TYPES.has(field.type as WorkerFieldType)) {
      addIssue(errors, `${itemPath}.type`, "invalid_enum", "Unsupported field type.");
    }
    if (typeof field.required !== "boolean") addIssue(errors, `${itemPath}.required`, "invalid_type", "Expected a boolean.");
    if (field.description !== undefined) checkString(field.description, `${itemPath}.description`, 1, 500, errors);
  });
  return errors.every((e) => !e.path.startsWith(path + "["));
}

export function parseWorkerDefinition(input: unknown): WorkerDefinitionParseResult {
  const errors: WorkerDefinitionIssue[] = [];
  if (!isRecord(input)) {
    return { ok: false, errors: [{ path: "", code: "invalid_type", message: "Worker definition must be an object." }] };
  }

  if (containsSecretLikeValue(input)) {
    addIssue(errors, "", "secret_like_value", "Do not store API keys, access tokens or private keys in a worker definition. Use the secure integration vault.");
  }

  checkKeys(input, [
    "schema_version", "purpose", "responsibilities", "inputs", "outputs", "capability_keys",
    "allowed_actions", "approval_required_for", "autonomy_mode", "execution", "verification", "workspace",
  ], "", errors);

  if (input.schema_version !== WORKER_DEFINITION_SCHEMA_VERSION) {
    addIssue(errors, "schema_version", "unsupported_version", `Expected schema version ${WORKER_DEFINITION_SCHEMA_VERSION}.`);
  }
  checkString(input.purpose, "purpose", 1, 1200, errors);
  checkStringList(input.responsibilities, "responsibilities", 1, 12, 240, errors);
  validateFields(input.inputs, "inputs", errors);
  validateFields(input.outputs, "outputs", errors);
  checkStringList(input.capability_keys, "capability_keys", 0, 40, 100, errors);

  if (Array.isArray(input.capability_keys)) {
    input.capability_keys.forEach((key, index) => {
      if (typeof key === "string" && !CAPABILITY_PATTERN.test(key)) {
        addIssue(errors, `capability_keys[${index}]`, "invalid_capability_key", "Capability keys must use lowercase letters, numbers, dot, underscore, colon or hyphen.");
      }
    });
    if (new Set(input.capability_keys).size !== input.capability_keys.length) {
      addIssue(errors, "capability_keys", "duplicate_capability", "Capability keys must be unique.");
    }
  }

  if (!Array.isArray(input.allowed_actions) || input.allowed_actions.length === 0 || input.allowed_actions.length > 20) {
    addIssue(errors, "allowed_actions", "invalid_count", "Select between 1 and 20 actions.");
  } else {
    input.allowed_actions.forEach((action, index) => {
      if (typeof action !== "string" || !ACTIONS.has(action)) {
        addIssue(errors, `allowed_actions[${index}]`, "unsupported_action", "Action is not in the supported action catalog.");
      }
    });
    if (new Set(input.allowed_actions).size !== input.allowed_actions.length) {
      addIssue(errors, "allowed_actions", "duplicate_action", "Allowed actions must be unique.");
    }
  }

  if (!Array.isArray(input.approval_required_for)) {
    addIssue(errors, "approval_required_for", "invalid_type", "Expected an array of action names requiring approval.");
  } else {
    input.approval_required_for.forEach((action, index) => {
      if (typeof action !== "string" || !ACTIONS.has(action)) {
        addIssue(errors, `approval_required_for[${index}]`, "unsupported_action", "Approval rule references an unsupported action.");
      }
    });
    for (const action of CONSEQUENTIAL_ACTIONS) {
      if (!input.approval_required_for.includes(action)) {
        addIssue(errors, "approval_required_for", "missing_consequential_approval", `Consequential action '${action}' must require approval.`);
      }
    }
    if (new Set(input.approval_required_for).size !== input.approval_required_for.length) {
      addIssue(errors, "approval_required_for", "duplicate_action", "Approval-required actions must be unique.");
    }
  }

  if (typeof input.autonomy_mode !== "string" || !AUTONOMY_MODES.has(input.autonomy_mode as WorkerAutonomyMode)) {
    addIssue(errors, "autonomy_mode", "invalid_enum", "Use supervised or bounded_autonomy.");
  }

  if (!isRecord(input.execution)) {
    addIssue(errors, "execution", "invalid_type", "Expected execution limits.");
  } else {
    checkKeys(input.execution, ["max_steps", "timeout_seconds", "max_retries"], "execution", errors);
    const limits: Array<[string, number, number]> = [
      ["max_steps", 1, 50],
      ["timeout_seconds", 5, 900],
      ["max_retries", 0, 3],
    ];
    for (const [key, min, max] of limits) {
      const value = input.execution[key];
      if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
        addIssue(errors, `execution.${key}`, "out_of_range", `Expected an integer from ${min} to ${max}.`);
      }
    }
  }

  if (!isRecord(input.verification)) {
    addIssue(errors, "verification", "invalid_type", "Expected verification rules.");
  } else {
    checkKeys(input.verification, ["success_criteria", "require_evidence"], "verification", errors);
    checkStringList(input.verification.success_criteria, "verification.success_criteria", 1, 10, 300, errors);
    if (input.verification.require_evidence !== true) {
      addIssue(errors, "verification.require_evidence", "evidence_required", "Worker completion must require evidence.");
    }
  }

  if (!isRecord(input.workspace)) {
    addIssue(errors, "workspace", "invalid_type", "Expected workspace configuration.");
  } else {
    checkKeys(input.workspace, ["layout", "panels"], "workspace", errors);
    if (typeof input.workspace.layout !== "string" || !WORKSPACE_LAYOUTS.has(input.workspace.layout as WorkerWorkspaceLayout)) {
      addIssue(errors, "workspace.layout", "invalid_enum", "Unsupported workspace layout.");
    }
    checkStringList(input.workspace.panels, "workspace.panels", 1, 12, 64, errors);
  }

  if (errors.length > 0) return { ok: false, errors };

  // The checks above establish the complete shape. Keep this cast localized to
  // the validation boundary instead of spreading untrusted JSON throughout the app.
  return { ok: true, value: input as unknown as WorkerDefinition };
}
