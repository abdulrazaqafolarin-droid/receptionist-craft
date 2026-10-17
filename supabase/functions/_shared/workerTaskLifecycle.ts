/**
 * Pure safety contract for the general-purpose AI Worker task runtime.
 *
 * This module intentionally has no database or network access. The Edge
 * Function/runtime must call these guards before persisting a state change or
 * executing a capability. It does not itself execute work.
 */
import { CONSEQUENTIAL_ACTIONS, type WorkerAction, type WorkerAutonomyMode } from "./workerContract.ts";

export const WORKER_TASK_STATUSES = [
  "queued",
  "running",
  "waiting_approval",
  "done",
  "blocked",
  "failed",
  "cancelled",
] as const;

export type WorkerTaskStatus = typeof WORKER_TASK_STATUSES[number];
export type WorkerTaskEvent =
  | "start"
  | "request_approval"
  | "approve"
  | "reject"
  | "complete"
  | "block"
  | "fail"
  | "cancel"
  | "retry";

export interface TaskTransitionInput {
  status: WorkerTaskStatus;
  event: WorkerTaskEvent;
  retryCount?: number;
  maxRetries?: number;
  verificationPassed?: boolean;
  evidenceCount?: number;
  retryIsSafe?: boolean;
}

export type TaskTransitionResult =
  | { ok: true; status: WorkerTaskStatus }
  | { ok: false; error: string };

const TERMINAL_STATUSES = new Set<WorkerTaskStatus>(["done", "cancelled"]);

export function transitionWorkerTask(input: TaskTransitionInput): TaskTransitionResult {
  const { status, event } = input;

  if (!WORKER_TASK_STATUSES.includes(status)) {
    return { ok: false, error: "invalid_task_status" };
  }
  if (TERMINAL_STATUSES.has(status)) {
    return { ok: false, error: "task_is_terminal" };
  }

  if (status === "queued") {
    if (event === "start") return { ok: true, status: "running" };
    if (event === "cancel") return { ok: true, status: "cancelled" };
    return { ok: false, error: "event_not_allowed_from_queued" };
  }

  if (status === "running") {
    if (event === "request_approval") return { ok: true, status: "waiting_approval" };
    if (event === "complete") {
      if (input.verificationPassed !== true) {
        return { ok: false, error: "verification_not_passed" };
      }
      if (!Number.isInteger(input.evidenceCount) || (input.evidenceCount ?? 0) < 1) {
        return { ok: false, error: "completion_evidence_required" };
      }
      return { ok: true, status: "done" };
    }
    if (event === "block") return { ok: true, status: "blocked" };
    if (event === "fail") return { ok: true, status: "failed" };
    if (event === "cancel") return { ok: true, status: "cancelled" };
    return { ok: false, error: "event_not_allowed_from_running" };
  }

  if (status === "waiting_approval") {
    if (event === "approve") return { ok: true, status: "queued" };
    if (event === "reject") return { ok: true, status: "blocked" };
    if (event === "cancel") return { ok: true, status: "cancelled" };
    return { ok: false, error: "event_not_allowed_while_waiting_approval" };
  }

  if (status === "failed" || status === "blocked") {
    if (event !== "retry") return { ok: false, error: "retry_required_to_resume" };
    const retries = input.retryCount ?? 0;
    const maxRetries = input.maxRetries ?? 0;
    if (!Number.isInteger(retries) || !Number.isInteger(maxRetries) || retries < 0 || maxRetries < 0) {
      return { ok: false, error: "invalid_retry_budget" };
    }
    if (input.retryIsSafe !== true) return { ok: false, error: "retry_safety_not_confirmed" };
    if (retries >= maxRetries) return { ok: false, error: "retry_budget_exhausted" };
    return { ok: true, status: "queued" };
  }

  return { ok: false, error: "unsupported_transition" };
}

export interface ActionGateInput {
  action: string;
  allowedActions: readonly string[];
  approvalRequiredFor: readonly string[];
  approvalGranted?: boolean;
  autonomyMode: WorkerAutonomyMode;
}

export type ActionGateResult =
  | { ok: true; approvalRequired: false }
  | { ok: true; approvalRequired: true }
  | { ok: false; error: "action_not_allowed" | "approval_required" | "invalid_action" };

export function gateWorkerAction(input: ActionGateInput): ActionGateResult {
  if (!input.action || !input.allowedActions.includes(input.action)) {
    return { ok: false, error: "action_not_allowed" };
  }

  const action = input.action as WorkerAction;
  const consequential = (CONSEQUENTIAL_ACTIONS as readonly string[]).includes(action);
  const explicitlyRequiresApproval = input.approvalRequiredFor.includes(action);

  // The worker definition is not allowed to weaken this global safety rule.
  if (consequential || explicitlyRequiresApproval) {
    if (input.approvalGranted !== true) return { ok: false, error: "approval_required" };
    return { ok: true, approvalRequired: true };
  }

  if (input.autonomyMode !== "supervised" && input.autonomyMode !== "bounded_autonomy") {
    return { ok: false, error: "invalid_action" };
  }

  return { ok: true, approvalRequired: false };
}
