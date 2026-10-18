/** Persistent rate limiting shared across Supabase Edge Function isolates.
 *
 * The caller must pass an actor ID obtained from a successfully verified JWT,
 * never a request-body user ID. Database errors fail closed.
 */
type JsonRecord = Record<string, unknown>;
type ServiceClient = any;

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  burstWindowMs?: number;
  maxBurst?: number;
}

export interface PersistentRateLimitResult {
  available: boolean;
  allowed: boolean;
  retryAfterSeconds: number;
  reason: "window" | "burst" | null;
  remaining: number;
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

export async function consumePersistentRateLimit(
  service: ServiceClient,
  actorId: string,
  scope: string,
  config: RateLimitConfig,
): Promise<PersistentRateLimitResult> {
  const { data, error } = await service.rpc("consume_ai_worker_rate_limit", {
    p_actor_id: actorId,
    p_scope: scope,
    p_window_seconds: Math.max(1, Math.ceil(config.windowMs / 1000)),
    p_max_requests: config.maxRequests,
    p_burst_window_seconds: Math.max(1, Math.ceil((config.burstWindowMs ?? 5000) / 1000)),
    p_max_burst: config.maxBurst ?? Math.min(5, config.maxRequests),
  });
  if (error) {
    return { available: false, allowed: false, retryAfterSeconds: 1, reason: null, remaining: 0 };
  }

  const result = asRecord(data);
  if (!result || result.ok !== true || typeof result.allowed !== "boolean") {
    return { available: false, allowed: false, retryAfterSeconds: 1, reason: null, remaining: 0 };
  }

  const reason = result.reason === "window" || result.reason === "burst" ? result.reason : null;
  return {
    available: true,
    allowed: result.allowed,
    retryAfterSeconds: typeof result.retry_after_seconds === "number"
      ? Math.max(1, Math.ceil(result.retry_after_seconds))
      : 1,
    reason,
    remaining: typeof result.remaining === "number" ? Math.max(0, result.remaining) : 0,
  };
}
