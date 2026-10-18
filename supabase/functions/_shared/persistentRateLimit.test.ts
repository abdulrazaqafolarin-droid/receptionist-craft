import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { consumePersistentRateLimit } from "./persistentRateLimit.ts";

Deno.test("persistent rate limiter maps the configured windows and verified actor", async () => {
  let received: Record<string, unknown> | null = null;
  const service = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      assertEquals(name, "consume_ai_worker_rate_limit");
      received = args;
      return { data: { ok: true, allowed: false, reason: "burst", retry_after_seconds: 4, remaining: 0 }, error: null };
    },
  };
  const result = await consumePersistentRateLimit(
    service, "verified-user-id", "worker-runner",
    { windowMs: 60_000, maxRequests: 30, burstWindowMs: 5_000, maxBurst: 6 },
  );
  assertEquals(received, {
    p_actor_id: "verified-user-id",
    p_scope: "worker-runner",
    p_window_seconds: 60,
    p_max_requests: 30,
    p_burst_window_seconds: 5,
    p_max_burst: 6,
  });
  assertEquals(result.available, true);
  assertEquals(result.allowed, false);
  assertEquals(result.reason, "burst");
  assertEquals(result.retryAfterSeconds, 4);
});

Deno.test("persistent rate limiter fails closed when the database RPC fails", async () => {
  const service = { rpc: async () => ({ data: null, error: { message: "offline" } }) };
  const result = await consumePersistentRateLimit(
    service, "verified-user-id", "worker-tasks",
    { windowMs: 60_000, maxRequests: 30 },
  );
  assertEquals(result.available, false);
  assertEquals(result.allowed, false);
});

Deno.test("persistent rate limiter rejects malformed RPC payloads", async () => {
  const service = { rpc: async () => ({ data: { ok: true }, error: null }) };
  const result = await consumePersistentRateLimit(
    service, "verified-user-id", "worker-tasks",
    { windowMs: 60_000, maxRequests: 30 },
  );
  assertEquals(result.available, false);
  assertEquals(result.allowed, false);
});
