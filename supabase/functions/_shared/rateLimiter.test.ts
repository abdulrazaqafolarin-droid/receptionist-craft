import { checkRateLimit, RATE_LIMITS } from "./rateLimiter.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

Deno.test("rate limiter enforces a per-key sliding-window cap", () => {
  const key = `worker-registry-test-${crypto.randomUUID()}`;
  const config = {
    windowMs: 60_000,
    maxRequests: 2,
    burstWindowMs: 60_000,
    maxBurst: 10,
  };

  assert(checkRateLimit(key, config).allowed, "first request should be allowed");
  assert(checkRateLimit(key, config).allowed, "second request should be allowed");
  const limited = checkRateLimit(key, config);
  assert(!limited.allowed, "third request should be denied");
  assert(limited.reason === "window", "request should be denied by the window limit");
});

Deno.test("rate limiter isolates counters by verified-user key", () => {
  const suffix = crypto.randomUUID();
  const config = {
    windowMs: 60_000,
    maxRequests: 1,
    burstWindowMs: 60_000,
    maxBurst: 10,
  };

  assert(checkRateLimit(`worker-registry:user-a:${suffix}`, config).allowed, "user A first request should pass");
  assert(checkRateLimit(`worker-registry:user-b:${suffix}`, config).allowed, "user B must have a separate counter");
});

Deno.test("worker registry uses a bounded request budget", () => {
  assert(RATE_LIMITS.workerRegistry.maxRequests === 30, "worker registry window should cap at 30 requests");
  assert(RATE_LIMITS.workerRegistry.maxBurst === 6, "worker registry burst should cap at 6 requests");
});
