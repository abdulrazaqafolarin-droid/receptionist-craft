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

export function canCreateOrganizationWorker(membership: ActiveWorkerMembership | null): boolean {
  return !!membership && ["owner", "admin", "member"].includes(membership.role);
}

export function canEditWorker(
  actorId: string,
  worker: WorkerScope,
  membership: ActiveWorkerMembership | null,
): boolean {
  if (!worker.organization_id) return worker.created_by === actorId;
  if (!membership) return false;
  return membership.role === "owner" || membership.role === "admin" || worker.created_by === actorId;
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
