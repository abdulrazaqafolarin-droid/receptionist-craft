/**
 * Pure transition policy for durable general-purpose worker tasks.
 *
 * This is the runtime's safety contract, not a task executor. The trusted
 * runner must call it before persisting every state transition and must still
 * enforce capability permissions, approvals and idempotency at the adapter.
 */
export const WORKER_TASK_STATUSES = [
  "queued", "running", "waiting_approval", "done", "blocked", "failed", "cancelled",
] as const;

export type WorkerTaskStatus = typeof WORKER_TASK_STATUSES[number];
export type CompletionEvidenceKind = "source" | "action_receipt" | "verification";

export interface CompletionEvidence {
  kind: CompletionEvidenceKind;
  summary: string;
  reference?: string;
}

export interface WorkerTaskTransitionContext {
  /** The worker must be active before queued work can start. */
  workerActive?: boolean;
  /** Number of attempts already consumed by the task. */
  attemptCount?: number;
  /** Maximum attempts allowed by the worker definition. */
  maxRetries?: number;
  /** The previous outcome is known to be safe to retry. */
  retryable?: boolean;
  /** A human has approved the exact pending action/plan. */
  approvalGranted?: boolean;
  /** The condition that blocked the task has been resolved. */
  unblocked?: boolean;
  /** The executor has stopped and confirmed no action remains in flight. */
  executionStopped?: boolean;
  /** Evidence captured by trusted adapters/verifiers, not model prose alone. */
  completionEvidence?: unknown;
}

export type WorkerTaskTransitionResult =
  | { ok: true }
  | { ok: false; reason: string };

const STATUS_SET = new Set<string>(WORKER_TASK_STATUSES);

const ALLOWED: Record<WorkerTaskStatus, readonly WorkerTaskStatus[]> = {
  queued: ["running", "blocked", "cancelled"],
  running: ["waiting_approval", "done", "blocked", "failed", "queued", "cancelled"],
  waiting_approval: ["queued", "blocked", "cancelled"],
  blocked: ["queued", "cancelled"],
  failed: ["queued", "cancelled"],
  done: [],
  cancelled: [],
};

function validEvidence(value: unknown): value is CompletionEvidence[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) return false;
  const kinds = new Set<CompletionEvidenceKind>(["source", "action_receipt", "verification"]);
  const allValid = value.every((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return false;
    const record = item as Record<string, unknown>;
    if (!kinds.has(record.kind as CompletionEvidenceKind)) return false;
    if (typeof record.summary !== "string" || record.summary.trim().length === 0 || record.summary.length > 1000) return false;
    if (typeof record.reference !== "string" || record.reference.trim().length === 0 || record.reference.length > 500) return false;
    return true;
  });
  const hasVerification = value.some((item) =>
    typeof item === "object" && item !== null && !Array.isArray(item) &&
    (item as Record<string, unknown>).kind === "verification"
  );
  return allValid && hasVerification;
}

export function canTransitionWorkerTask(
  current: WorkerTaskStatus,
  next: WorkerTaskStatus,
  context: WorkerTaskTransitionContext = {},
): WorkerTaskTransitionResult {
  if (!STATUS_SET.has(current) || !STATUS_SET.has(next)) return { ok: false, reason: "invalid_status" };
  if (current === next) return { ok: false, reason: "same_state" };
  if (!ALLOWED[current].includes(next)) return { ok: false, reason: "transition_not_allowed" };

  if (current === "queued" && next === "running" && context.workerActive !== true) {
    return { ok: false, reason: "worker_not_active" };
  }

  if (current === "waiting_approval" && next === "queued" && context.approvalGranted !== true) {
    return { ok: false, reason: "approval_required" };
  }

  if (current === "blocked" && next === "queued" && context.unblocked !== true) {
    return { ok: false, reason: "blocking_condition_unresolved" };
  }

  if ((current === "running" || current === "failed") && next === "queued") {
    if (!Number.isInteger(context.attemptCount) || (context.attemptCount as number) < 1 ||
        !Number.isInteger(context.maxRetries) || (context.maxRetries as number) < 0) {
      return { ok: false, reason: "retry_budget_unknown" };
    }
    const attempts = context.attemptCount as number;
    const maxRetries = context.maxRetries as number;
    if (context.retryable !== true) return { ok: false, reason: "outcome_not_safe_to_retry" };
    if (attempts >= maxRetries + 1) return { ok: false, reason: "retry_budget_exhausted" };
  }

  if (current === "running" && next === "cancelled" && context.executionStopped !== true) {
    return { ok: false, reason: "execution_still_in_flight" };
  }

  if (next === "done" && !validEvidence(context.completionEvidence)) {
    return { ok: false, reason: "completion_evidence_required" };
  }

  return { ok: true };
}
