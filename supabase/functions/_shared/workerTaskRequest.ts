/** Pure validation for user-created worker task requests. */
export interface WorkerTaskCreateRequest {
  worker_id: string;
  title: string;
  goal: string;
  input_json: Record<string, unknown>;
  idempotency_key: string;
}

export type WorkerTaskRequestParseResult =
  | { ok: true; value: WorkerTaskCreateRequest }
  | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECRET_PATTERNS = [
  /sk_(?:live|test)_[A-Za-z0-9]{12,}/,
  /sk-(?:proj-)?[A-Za-z0-9_-]{24,}/,
  /AIza[0-9A-Za-z_-]{30,}/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /Bearer\s+[A-Za-z0-9._~+/-]{24,}/i,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasSecretLikeValue(value: unknown): boolean {
  if (typeof value === "string") return SECRET_PATTERNS.some((pattern) => pattern.test(value));
  if (Array.isArray(value)) return value.some(hasSecretLikeValue);
  if (isRecord(value)) return Object.values(value).some(hasSecretLikeValue);
  return false;
}

export function parseWorkerTaskCreateRequest(input: unknown): WorkerTaskRequestParseResult {
  if (!isRecord(input)) return { ok: false, error: "invalid_body" };
  if (typeof input.worker_id !== "string" || !UUID.test(input.worker_id)) {
    return { ok: false, error: "invalid_worker_id" };
  }
  if (typeof input.title !== "string" || input.title.trim().length < 1 || input.title.trim().length > 200) {
    return { ok: false, error: "invalid_title" };
  }
  if (typeof input.goal !== "string" || input.goal.trim().length < 1 || input.goal.trim().length > 4000) {
    return { ok: false, error: "invalid_goal" };
  }
  if (typeof input.idempotency_key !== "string" ||
      input.idempotency_key.length < 8 || input.idempotency_key.length > 128 ||
      !/^[A-Za-z0-9._:-]+$/.test(input.idempotency_key)) {
    return { ok: false, error: "invalid_idempotency_key" };
  }
  const taskInput = input.input_json === undefined ? {} : input.input_json;
  if (!isRecord(taskInput)) return { ok: false, error: "invalid_input_json" };
  let serialized: string;
  try {
    serialized = JSON.stringify(taskInput);
  } catch {
    return { ok: false, error: "invalid_input_json" };
  }
  if (new TextEncoder().encode(serialized).byteLength > 32768) {
    return { ok: false, error: "input_too_large" };
  }
  if (hasSecretLikeValue(taskInput) || hasSecretLikeValue(input.goal) || hasSecretLikeValue(input.title)) {
    return { ok: false, error: "secret_like_value" };
  }
  return {
    ok: true,
    value: {
      worker_id: input.worker_id,
      title: input.title.trim(),
      goal: input.goal.trim(),
      input_json: taskInput,
      idempotency_key: input.idempotency_key,
    },
  };
}

export function isBoundedApprovalId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 8 && value.trim().length <= 128;
}
