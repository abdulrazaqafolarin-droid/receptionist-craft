// Rate limiter using in-memory store with sliding window
// For production at scale, use Redis or Supabase table

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

// In-memory store (resets on cold start - acceptable for edge functions)
const rateLimitStore = new Map<string, RateLimitEntry>();

interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Max requests per window
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
}

/**
 * Check if a request should be rate limited
 * @param key Unique identifier (e.g., sessionId, IP, receptionistId:sessionId)
 * @param config Rate limit configuration
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  // Clean up old entries periodically (simple garbage collection)
  if (rateLimitStore.size > 10000) {
    const cutoff = now - config.windowMs * 2;
    for (const [k, v] of rateLimitStore.entries()) {
      if (v.windowStart < cutoff) {
        rateLimitStore.delete(k);
      }
    }
  }

  if (!entry || now - entry.windowStart > config.windowMs) {
    // New window
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: config.maxRequests - 1 };
  }

  if (entry.count >= config.maxRequests) {
    // Rate limited
    const retryAfterMs = config.windowMs - (now - entry.windowStart);
    return { 
      allowed: false, 
      remaining: 0, 
      retryAfterMs: Math.max(0, retryAfterMs)
    };
  }

  // Increment counter
  entry.count++;
  rateLimitStore.set(key, entry);
  return { allowed: true, remaining: config.maxRequests - entry.count };
}

// Preset configurations
export const RATE_LIMITS = {
  // Widget chat: 30 messages per minute per session (generous for real users)
  widgetChat: { windowMs: 60_000, maxRequests: 30 },
  
  // Booking: 10 bookings per minute per session (prevent spam)
  booking: { windowMs: 60_000, maxRequests: 10 },
  
  // Check availability: 20 checks per minute
  checkAvailability: { windowMs: 60_000, maxRequests: 20 },
  
  // Auth actions: 5 per minute (prevent brute force)
  auth: { windowMs: 60_000, maxRequests: 5 },
  
  // Email/SMS: 3 per minute per recipient
  notifications: { windowMs: 60_000, maxRequests: 3 },
} as const;

/**
 * Create a rate limit response
 */
export function rateLimitResponse(retryAfterMs: number = 60000): Response {
  const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
  return new Response(
    JSON.stringify({ 
      error: "Too many requests. Please slow down.",
      retryAfterSeconds 
    }),
    { 
      status: 429, 
      headers: { 
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSeconds),
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
      } 
    }
  );
}
