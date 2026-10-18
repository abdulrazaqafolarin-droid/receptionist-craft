export type WorkerTaskResponseRow = Record<string, unknown>;

const READABLE_TASK_FIELDS = [
  "id",
  "worker_id",
  "created_by",
  "title",
  "goal",
  "status",
  "output_json",
  "error_text",
  "attempt_count",
  "created_at",
  "updated_at",
] as const;

/**
 * Read-only worker members get the same safe projection as task history.
 * Inputs, checkpoints, idempotency keys and approval internals are available
 * only to editors, because task payloads may contain customer/business data.
 */
export function projectWorkerTaskResponse(
  task: WorkerTaskResponseRow,
  canEdit: boolean,
): WorkerTaskResponseRow {
  if (canEdit) return task;
  const projection: WorkerTaskResponseRow = {};
  for (const field of READABLE_TASK_FIELDS) {
    if (field in task) projection[field] = task[field];
  }
  return projection;
}
