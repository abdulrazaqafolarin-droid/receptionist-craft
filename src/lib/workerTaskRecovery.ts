export interface PreparedWorkerTaskRecovery {
  title: string;
  goal: string;
  payload: Record<string, unknown>;
}

export type WorkerTaskRecoveryResult =
  | { ok: true; value: PreparedWorkerTaskRecovery }
  | { ok: false; error: string };

/**
 * Prepare a new draft from a failed/blocked task without mutating the original.
 * This is deliberately a prefill operation, not a retry/requeue transition.
 */
export function prepareWorkerTaskRecovery(
  task: unknown,
  expectedWorkerId: string,
): WorkerTaskRecoveryResult {
  if (typeof task !== "object" || task === null || Array.isArray(task)) {
    return { ok: false, error: "The previous task could not be loaded." };
  }

  const row = task as Record<string, unknown>;
  if (row.worker_id !== expectedWorkerId) {
    return { ok: false, error: "The task does not belong to this worker." };
  }
  if (row.status !== "blocked" && row.status !== "failed") {
    return { ok: false, error: "Only blocked or failed tasks can be used to prepare a recovery draft." };
  }

  const input = row.input_json;
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "The previous task does not contain a supported draft payload." };
  }
  const inputRecord = input as Record<string, unknown>;
  if (inputRecord.execution_mode !== "draft") {
    return { ok: false, error: "The previous task does not contain a supported draft payload." };
  }

  const payload = inputRecord.payload;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { ok: false, error: "The previous task payload is missing or invalid." };
  }

  const originalTitle = typeof row.title === "string" && row.title.trim()
    ? row.title.trim()
    : "Draft task";
  const title = originalTitle.slice(0, 190) + " (revised)";
  const goal = typeof row.goal === "string" ? row.goal : "";

  return {
    ok: true,
    value: {
      title,
      goal,
      payload: payload as Record<string, unknown>,
    },
  };
}
