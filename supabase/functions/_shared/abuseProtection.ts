// ═══════════════════════════════════════════════════════════════════════════
// ABUSE PROTECTION SYSTEM - Rate Limiting & Bot Detection
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// RATE LIMITING - 20 messages per minute per session
// ─────────────────────────────────────────────────────────────────────────────
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

export const RATE_LIMITS = {
  widgetChat: { windowMs: 60_000, maxRequests: 30 }, // 30 per minute
  booking: { windowMs: 60_000, maxRequests: 10 },
  checkAvailability: { windowMs: 60_000, maxRequests: 20 },
} as const;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
}

export function checkRateLimit(
  sessionId: string, 
  type: keyof typeof RATE_LIMITS = 'widgetChat'
): RateLimitResult {
  const config = RATE_LIMITS[type];
  const now = Date.now();
  const key = `${type}:${sessionId}`;
  const entry = rateLimitStore.get(key);

  // Garbage collection - clean old entries
  if (rateLimitStore.size > 5000) {
    const cutoff = now - config.windowMs * 2;
    for (const [k, v] of rateLimitStore.entries()) {
      if (v.windowStart < cutoff) rateLimitStore.delete(k);
    }
  }

  // New window
  if (!entry || now - entry.windowStart > config.windowMs) {
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: config.maxRequests - 1 };
  }

  // Check if over limit
  if (entry.count >= config.maxRequests) {
    const retryAfterMs = config.windowMs - (now - entry.windowStart);
    return { 
      allowed: false, 
      remaining: 0, 
      retryAfterMs: Math.max(0, retryAfterMs)
    };
  }

  // Increment counter
  entry.count++;
  return { allowed: true, remaining: config.maxRequests - entry.count };
}

// ─────────────────────────────────────────────────────────────────────────────
// FAILED BOOKING ATTEMPT TRACKING
// ─────────────────────────────────────────────────────────────────────────────
interface FailedAttemptEntry {
  count: number;
  firstAttempt: number;
  lastAttempt: number;
}

const failedBookingStore = new Map<string, FailedAttemptEntry>();
const FAILED_BOOKING_CONFIG = {
  maxAttempts: 5,          // Block after 5 failed attempts
  windowMs: 300_000,       // 5 minute window
  blockDurationMs: 600_000 // 10 minute block
};

export interface FailedAttemptResult {
  blocked: boolean;
  attemptsRemaining: number;
  blockExpiresMs?: number;
}

export function recordFailedBooking(sessionId: string): FailedAttemptResult {
  const now = Date.now();
  const key = `failed_booking:${sessionId}`;
  const entry = failedBookingStore.get(key);

  // Clean old entries
  if (failedBookingStore.size > 1000) {
    const cutoff = now - FAILED_BOOKING_CONFIG.blockDurationMs;
    for (const [k, v] of failedBookingStore.entries()) {
      if (v.lastAttempt < cutoff) failedBookingStore.delete(k);
    }
  }

  if (!entry || now - entry.firstAttempt > FAILED_BOOKING_CONFIG.windowMs) {
    // Reset or new entry
    failedBookingStore.set(key, { count: 1, firstAttempt: now, lastAttempt: now });
    return { blocked: false, attemptsRemaining: FAILED_BOOKING_CONFIG.maxAttempts - 1 };
  }

  // Increment failed attempt
  entry.count++;
  entry.lastAttempt = now;

  if (entry.count >= FAILED_BOOKING_CONFIG.maxAttempts) {
    const blockExpiresMs = entry.firstAttempt + FAILED_BOOKING_CONFIG.blockDurationMs - now;
    return { blocked: true, attemptsRemaining: 0, blockExpiresMs };
  }

  return { 
    blocked: false, 
    attemptsRemaining: FAILED_BOOKING_CONFIG.maxAttempts - entry.count 
  };
}

export function checkBookingBlocked(sessionId: string): FailedAttemptResult {
  const now = Date.now();
  const key = `failed_booking:${sessionId}`;
  const entry = failedBookingStore.get(key);

  if (!entry) {
    return { blocked: false, attemptsRemaining: FAILED_BOOKING_CONFIG.maxAttempts };
  }

  // Check if block has expired
  if (now - entry.firstAttempt > FAILED_BOOKING_CONFIG.blockDurationMs) {
    failedBookingStore.delete(key);
    return { blocked: false, attemptsRemaining: FAILED_BOOKING_CONFIG.maxAttempts };
  }

  if (entry.count >= FAILED_BOOKING_CONFIG.maxAttempts) {
    const blockExpiresMs = entry.firstAttempt + FAILED_BOOKING_CONFIG.blockDurationMs - now;
    return { blocked: true, attemptsRemaining: 0, blockExpiresMs };
  }

  return { blocked: false, attemptsRemaining: FAILED_BOOKING_CONFIG.maxAttempts - entry.count };
}

export function clearFailedAttempts(sessionId: string): void {
  failedBookingStore.delete(`failed_booking:${sessionId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// HONEYPOT FIELD DETECTION
// ─────────────────────────────────────────────────────────────────────────────
export interface HoneypotCheckResult {
  isBot: boolean;
  reason?: string;
}

export function checkHoneypot(
  honeypotValue: string | undefined | null,
  formSubmitTime?: number // milliseconds from page load to form submit
): HoneypotCheckResult {
  // Check if honeypot field was filled (bots often fill all fields)
  if (honeypotValue && honeypotValue.trim().length > 0) {
    return { isBot: true, reason: 'honeypot_filled' };
  }

  // Check if form was submitted too quickly (less than 1 second)
  if (formSubmitTime !== undefined && formSubmitTime < 1000) {
    return { isBot: true, reason: 'too_fast_submission' };
  }

  // Check if form was submitted impossibly quickly (less than 100ms)
  if (formSubmitTime !== undefined && formSubmitTime < 100) {
    return { isBot: true, reason: 'instant_submission' };
  }

  return { isBot: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// SUSPICIOUS PATTERN DETECTION
// ─────────────────────────────────────────────────────────────────────────────
interface SuspiciousActivity {
  sessionId: string;
  timestamp: number;
  pattern: string;
  severity: 'low' | 'medium' | 'high';
  details: Record<string, unknown>;
}

const suspiciousActivityLog: SuspiciousActivity[] = [];
const MAX_LOG_SIZE = 1000;

export type SuspiciousPattern = 
  | 'rapid_messages'
  | 'repeated_content'
  | 'injection_attempt'
  | 'honeypot_triggered'
  | 'failed_booking_spam'
  | 'rate_limit_exceeded'
  | 'suspicious_user_agent'
  | 'missing_headers';

export function logSuspiciousActivity(
  sessionId: string,
  pattern: SuspiciousPattern,
  severity: 'low' | 'medium' | 'high',
  details: Record<string, unknown> = {}
): void {
  // Trim log if too large
  if (suspiciousActivityLog.length >= MAX_LOG_SIZE) {
    suspiciousActivityLog.splice(0, 100); // Remove oldest 100 entries
  }

  const entry: SuspiciousActivity = {
    sessionId,
    timestamp: Date.now(),
    pattern,
    severity,
    details
  };

  suspiciousActivityLog.push(entry);
  
  // Log to console for edge function logs
  console.warn(`[Abuse Protection] Suspicious activity detected:`, {
    sessionId: sessionId.substring(0, 8) + '...', // Partial for privacy
    pattern,
    severity,
    ...details
  });
}

export function getRecentSuspiciousActivity(
  sessionId?: string, 
  sinceMs: number = 3600000 // Last hour
): SuspiciousActivity[] {
  const cutoff = Date.now() - sinceMs;
  return suspiciousActivityLog.filter(entry => {
    if (entry.timestamp < cutoff) return false;
    if (sessionId && entry.sessionId !== sessionId) return false;
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE CONTENT ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────
const recentMessagesStore = new Map<string, { messages: string[]; timestamps: number[] }>();

export interface ContentAnalysisResult {
  suspicious: boolean;
  patterns: SuspiciousPattern[];
  score: number; // 0-100, higher = more suspicious
}

export function analyzeMessageContent(
  sessionId: string,
  message: string
): ContentAnalysisResult {
  const patterns: SuspiciousPattern[] = [];
  let score = 0;
  const now = Date.now();
  const key = `content:${sessionId}`;
  
  // Get or create message history
  let history = recentMessagesStore.get(key);
  if (!history) {
    history = { messages: [], timestamps: [] };
    recentMessagesStore.set(key, history);
  }

  // Clean old messages (keep last 5 minutes)
  const cutoff = now - 300000;
  while (history.timestamps.length > 0 && history.timestamps[0] < cutoff) {
    history.messages.shift();
    history.timestamps.shift();
  }

  // Check for rapid messages (more than 5 in 10 seconds)
  const tenSecondsAgo = now - 10000;
  const recentCount = history.timestamps.filter(t => t > tenSecondsAgo).length;
  if (recentCount >= 5) {
    patterns.push('rapid_messages');
    score += 30;
  }

  // Check for repeated content
  const duplicateCount = history.messages.filter(m => m === message).length;
  if (duplicateCount >= 2) {
    patterns.push('repeated_content');
    score += 25;
  }

  // Check for injection attempts
  const injectionPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i, // onclick=, onerror=, etc.
    /\{\{.*\}\}/,  // Template injection
    /\$\{.*\}/,    // Template literal injection
    /;\\s*(DROP|DELETE|INSERT|UPDATE|SELECT)/i, // SQL injection
  ];
  
  for (const pattern of injectionPatterns) {
    if (pattern.test(message)) {
      patterns.push('injection_attempt');
      score += 50;
      break;
    }
  }

  // Add current message to history
  history.messages.push(message);
  history.timestamps.push(now);

  // Limit history size
  if (history.messages.length > 50) {
    history.messages.shift();
    history.timestamps.shift();
  }

  return {
    suspicious: score >= 25,
    patterns,
    score: Math.min(100, score)
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPREHENSIVE ABUSE CHECK
// ─────────────────────────────────────────────────────────────────────────────
export interface AbuseCheckResult {
  allowed: boolean;
  reason?: string;
  retryAfterMs?: number;
  suspiciousScore: number;
}

export function performAbuseCheck(
  sessionId: string,
  message: string,
  honeypotValue?: string,
  formSubmitTime?: number
): AbuseCheckResult {
  // 1. Rate limit check
  const rateLimit = checkRateLimit(sessionId, 'widgetChat');
  if (!rateLimit.allowed) {
    logSuspiciousActivity(sessionId, 'rate_limit_exceeded', 'medium', {
      retryAfterMs: rateLimit.retryAfterMs
    });
    return {
      allowed: false,
      reason: 'Rate limit exceeded. Please slow down.',
      retryAfterMs: rateLimit.retryAfterMs,
      suspiciousScore: 50
    };
  }

  // 2. Honeypot check
  const honeypot = checkHoneypot(honeypotValue, formSubmitTime);
  if (honeypot.isBot) {
    logSuspiciousActivity(sessionId, 'honeypot_triggered', 'high', {
      reason: honeypot.reason,
      formSubmitTime
    });
    return {
      allowed: false,
      reason: 'Request blocked.',
      suspiciousScore: 100
    };
  }

  // 3. Content analysis
  const contentAnalysis = analyzeMessageContent(sessionId, message);
  if (contentAnalysis.suspicious) {
    for (const pattern of contentAnalysis.patterns) {
      logSuspiciousActivity(sessionId, pattern, 
        contentAnalysis.score >= 50 ? 'high' : 'medium', 
        { score: contentAnalysis.score }
      );
    }
    
    // Only block on high suspicion
    if (contentAnalysis.score >= 75) {
      return {
        allowed: false,
        reason: 'Suspicious activity detected.',
        suspiciousScore: contentAnalysis.score
      };
    }
  }

  // 4. Check if booking is blocked due to failed attempts
  const bookingCheck = checkBookingBlocked(sessionId);
  // Note: This doesn't block messages, just tracks the state

  return {
    allowed: true,
    suspiciousScore: contentAnalysis.score
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE HELPERS
// ─────────────────────────────────────────────────────────────────────────────
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

export function blockedResponse(reason: string = "Request blocked"): Response {
  return new Response(
    JSON.stringify({ error: reason }),
    { 
      status: 403, 
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
      } 
    }
  );
}
