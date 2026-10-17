// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTION RATE LIMITER — Sliding Window with Tiered Limits
// ═══════════════════════════════════════════════════════════════════════════
// For production at scale, use Redis or Supabase table.
// In-memory store resets on cold start — acceptable for edge functions.
// ═══════════════════════════════════════════════════════════════════════════

interface RateLimitEntry {
  count: number;
  windowStart: number;
  burstCount: number;
  burstWindowStart: number;
}

// In-memory store
const rateLimitStore = new Map<string, RateLimitEntry>();

// Periodic cleanup to prevent memory leaks
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 120_000; // 2 minutes

function maybeCleanup(windowMs: number): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  
  const cutoff = now - windowMs * 3;
  let cleaned = 0;
  for (const [k, v] of rateLimitStore.entries()) {
    if (v.windowStart < cutoff) {
      rateLimitStore.delete(k);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[RateLimiter] Cleaned ${cleaned} expired entries, ${rateLimitStore.size} remaining`);
  }
}

interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Max requests per window
  burstWindowMs?: number;  // Short burst window (e.g. 5s)
  maxBurst?: number;       // Max requests in burst window
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
  reason?: 'window' | 'burst';
}

/**
 * Check if a request should be rate limited with burst protection
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  maybeCleanup(config.windowMs);
  
  let entry = rateLimitStore.get(key);

  if (!entry || now - entry.windowStart > config.windowMs) {
    // New window
    entry = { 
      count: 1, 
      windowStart: now, 
      burstCount: 1, 
      burstWindowStart: now 
    };
    rateLimitStore.set(key, entry);
    return { allowed: true, remaining: config.maxRequests - 1 };
  }

  // Check burst limit (rapid-fire protection)
  const burstWindowMs = config.burstWindowMs || 5000;
  const maxBurst = config.maxBurst || Math.min(5, config.maxRequests);
  
  if (now - entry.burstWindowStart > burstWindowMs) {
    entry.burstCount = 1;
    entry.burstWindowStart = now;
  } else {
    entry.burstCount++;
    if (entry.burstCount > maxBurst) {
      return { 
        allowed: false, 
        remaining: 0, 
        retryAfterMs: burstWindowMs - (now - entry.burstWindowStart),
        reason: 'burst'
      };
    }
  }

  // Check window limit
  if (entry.count >= config.maxRequests) {
    const retryAfterMs = config.windowMs - (now - entry.windowStart);
    return { 
      allowed: false, 
      remaining: 0, 
      retryAfterMs: Math.max(0, retryAfterMs),
      reason: 'window'
    };
  }

  // Increment counter
  entry.count++;
  rateLimitStore.set(key, entry);
  return { allowed: true, remaining: config.maxRequests - entry.count };
}

// ═══════════════════════════════════════════════════════════════════════════
// PRESET CONFIGURATIONS (tuned per endpoint)
// ═══════════════════════════════════════════════════════════════════════════
export const RATE_LIMITS = {
  // Widget chat: 30 messages per minute, max 5 in 5 seconds
  widgetChat: { windowMs: 60_000, maxRequests: 30, burstWindowMs: 5000, maxBurst: 5 },
  
  // Booking: 10 bookings per minute, max 3 in 5 seconds
  booking: { windowMs: 60_000, maxRequests: 10, burstWindowMs: 5000, maxBurst: 3 },
  
  // Check availability: 20 checks per minute
  checkAvailability: { windowMs: 60_000, maxRequests: 20, burstWindowMs: 5000, maxBurst: 5 },
  
  // Auth actions: 5 per minute (prevent brute force)
  auth: { windowMs: 60_000, maxRequests: 5, burstWindowMs: 10000, maxBurst: 2 },
  
  // Email/SMS: 3 per minute per recipient
  notifications: { windowMs: 60_000, maxRequests: 3, burstWindowMs: 10000, maxBurst: 2 },
  
  // Analytics: 10 per minute
  analytics: { windowMs: 60_000, maxRequests: 10, burstWindowMs: 5000, maxBurst: 3 },
  
  // Authenticated worker registry: 30 requests/minute, 6 in 5 seconds per user
  workerRegistry: { windowMs: 60_000, maxRequests: 30, burstWindowMs: 5000, maxBurst: 6 },
} as const;

/**
 * Create a rate limit HTTP response with proper headers
 */
export function rateLimitResponse(retryAfterMs: number = 60000, reason?: string): Response {
  const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
  return new Response(
    JSON.stringify({ 
      error: reason === 'burst' 
        ? "Too many requests in quick succession. Please slow down."
        : "Rate limit exceeded. Please try again later.",
      retryAfterSeconds 
    }),
    { 
      status: 429, 
      headers: { 
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Reason": reason || "window",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version"
      } 
    }
  );
}
