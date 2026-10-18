export type WorkerHeartbeatOutcome =
  | "ok"
  | "cancellation_requested"
  | "lease_lost"
  | "unavailable";

export function classifyWorkerHeartbeat(data: unknown, rpcFailed = false): WorkerHeartbeatOutcome {
  if (rpcFailed || typeof data !== "object" || data === null || Array.isArray(data)) {
    return "unavailable";
  }

  const result = data as Record<string, unknown>;
  if (result.ok === true) return "ok";
  if (result.error === "cancellation_requested") return "cancellation_requested";
  if (result.error === "lease_not_owned" || result.error === "lease_expired") return "lease_lost";
  return "unavailable";
}
