/**
 * Pure authorization decisions for the worker registry.
 *
 * Database membership lookup happens in the Edge Function; these helpers
 * decide which actions that verified membership permits.
 */

export interface WorkerScope {
  organization_id: string | null;
  created_by: string;
}

export interface ActiveWorkerMembership {
  role: string;
}

const CAN_CREATE_OR_EDIT_ROLES = new Set(["owner", "admin", "member"]);

export function canReadWorker(
  actorId: string,
  worker: WorkerScope,
  membership: ActiveWorkerMembership | null,
): boolean {
  if (!worker.organization_id) return worker.created_by === actorId;
  return membership !== null;
}

export function canCreateOrganizationWorker(membership: ActiveWorkerMembership | null): boolean {
  return !!membership && CAN_CREATE_OR_EDIT_ROLES.has(membership.role);
}

export function canEditWorker(
  actorId: string,
  worker: WorkerScope,
  membership: ActiveWorkerMembership | null,
): boolean {
  if (!worker.organization_id) return worker.created_by === actorId;
  if (!membership) return false;
  if (membership.role === "owner" || membership.role === "admin") return true;
  // A creator's authorship does not override a later role downgrade to viewer
  // or an unexpected role value.
  return membership.role === "member" && worker.created_by === actorId;
}

export function canArchiveWorker(
  actorId: string,
  worker: WorkerScope,
  membership: ActiveWorkerMembership | null,
): boolean {
  if (!worker.organization_id) return worker.created_by === actorId;
  if (!membership) return false;
  return membership.role === "owner" || membership.role === "admin";
}

/** Publication/resume is an organization-level authorization decision.
 * A personal worker belongs to its creator; a shared worker may only be
 * activated or resumed by a joined owner/admin, even if a member authored it.
 */
export function canPublishWorker(
  actorId: string,
  worker: WorkerScope,
  membership: ActiveWorkerMembership | null,
): boolean {
  if (!worker.organization_id) return worker.created_by === actorId;
  if (!membership) return false;
  return membership.role === "owner" || membership.role === "admin";
}
