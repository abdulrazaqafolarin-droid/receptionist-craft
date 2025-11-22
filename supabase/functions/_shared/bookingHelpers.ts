/**
 * Booking Helper Functions
 * Shared utilities for appointment booking flow
 */

import { createHash } from "https://deno.land/std@0.177.0/node/crypto.ts";

/**
 * Build a stable idempotency key from user ID and request text
 */
export function buildIdempotencyKey(userId: string | null, text: string): string {
  const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');
  const hash = createHash('sha256')
    .update(`${userId || 'anon'}:${normalized}`)
    .digest('hex');
  const hashStr = typeof hash === 'string' ? hash : hash.toString();
  return `booking_${hashStr.substring(0, 16)}`;
}

/**
 * Parse ISO date and time in a specific timezone and convert to UTC ISO string
 */
export function parseISOLocal(date: string, time: string, timezone: string = 'UTC'): string {
  try {
    // Combine date and time: "2025-12-01" + "14:30" -> "2025-12-01T14:30:00"
    const localDateTime = `${date}T${time}:00`;
    
    // For now, treat as UTC (full timezone conversion would require a library)
    // In production, you'd use Intl.DateTimeFormat or a library like date-fns-tz
    const dt = new Date(localDateTime + 'Z');
    
    if (isNaN(dt.getTime())) {
      throw new Error(`Invalid date/time: ${date} ${time}`);
    }
    
    return dt.toISOString();
  } catch (err) {
    console.error('parseISOLocal error:', err);
    throw err;
  }
}

/**
 * Format a slot time for human-readable display
 */
export function formatHumanSlot(slotISO: string, timezone: string = 'UTC'): string {
  try {
    const d = new Date(slotISO);
    // Simple formatting - in production use Intl.DateTimeFormat with timezone
    return d.toLocaleString('en-US', { 
      dateStyle: 'medium', 
      timeStyle: 'short',
      timeZone: timezone 
    });
  } catch {
    return slotISO;
  }
}

/**
 * Sanitize user input to prevent XSS in metadata
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .substring(0, 1000); // Limit length
}

/**
 * Extract JSON from markdown code fences
 */
export function extractJSON(text: string): string {
  // Try ```json...``` first
  let match = text.match(/```json\s*([\s\S]*?)```/);
  if (match) return match[1].trim();
  
  // Try ```...```
  match = text.match(/```\s*([\s\S]*?)```/);
  if (match) return match[1].trim();
  
  // Return as-is
  return text.trim();
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 2,
  initialDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxAttempts - 1) {
        const delay = initialDelayMs * Math.pow(2, attempt);
        console.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, err);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Retry failed');
}

/**
 * Check if slot matches requested time (within 1 hour tolerance)
 */
export function isSlotMatch(slotISO: string, requestedISO: string, toleranceMs: number = 3600000): boolean {
  try {
    const slotTime = new Date(slotISO).getTime();
    const requestedTime = new Date(requestedISO).getTime();
    return Math.abs(slotTime - requestedTime) < toleranceMs;
  } catch {
    return false;
  }
}
