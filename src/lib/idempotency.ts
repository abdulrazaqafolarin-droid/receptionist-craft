// ═══════════════════════════════════════════════════════════════════════════
// IDEMPOTENCY KEY UTILITIES - Prevent Duplicate Operations
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a stable idempotency key from request parameters
 * Uses a hash of the relevant data to ensure consistent keys for identical requests
 */
export function generateIdempotencyKey(
  userId: string | null,
  action: string,
  params: Record<string, unknown>
): string {
  const payload = JSON.stringify({
    userId,
    action,
    params,
    // Include date (without time) to allow same-day retries but prevent cross-day duplicates
    date: new Date().toISOString().split('T')[0],
  });
  
  return hashString(payload);
}

/**
 * Simple hash function for generating consistent keys
 * Uses a variation of djb2 hash algorithm
 */
function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  // Convert to hex and ensure positive
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Generate a UUID-based idempotency key for one-time operations
 */
export function generateUniqueIdempotencyKey(): string {
  return crypto.randomUUID();
}

/**
 * Storage for tracking in-flight requests (client-side deduplication)
 */
const inFlightRequests = new Map<string, Promise<unknown>>();

/**
 * Deduplicate concurrent identical requests
 * Returns existing promise if request with same key is in-flight
 */
export async function deduplicateRequest<T>(
  key: string,
  requestFn: () => Promise<T>
): Promise<T> {
  // Check if request is already in flight
  const existing = inFlightRequests.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  // Create new request and track it
  const promise = requestFn().finally(() => {
    // Clean up after request completes
    inFlightRequests.delete(key);
  });

  inFlightRequests.set(key, promise);
  return promise;
}

/**
 * Booking-specific idempotency key generator
 */
export function generateBookingIdempotencyKey(
  receptionistId: string,
  serviceId: string,
  startTime: string,
  customerEmail?: string,
  customerPhone?: string
): string {
  return generateIdempotencyKey(null, 'book_appointment', {
    receptionistId,
    serviceId,
    startTime: new Date(startTime).toISOString(), // Normalize time format
    contact: customerEmail || customerPhone || 'unknown',
  });
}
