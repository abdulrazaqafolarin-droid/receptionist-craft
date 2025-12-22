// ═══════════════════════════════════════════════════════════════════════════
// IDEMPOTENCY UTILITIES - Prevent Duplicate Operations (Deno/Edge)
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * Generate a stable idempotency key from request parameters
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
    date: new Date().toISOString().split('T')[0],
  });
  
  return hashString(payload);
}

/**
 * Simple hash function for generating consistent keys
 */
function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Check if an operation with this idempotency key has already been processed
 * Uses appointments table as example - adapt for other tables
 */
export async function checkIdempotency(
  supabase: ReturnType<typeof createClient>,
  table: string,
  idempotencyKey: string
): Promise<{ exists: boolean; existingRecord?: any }> {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (error) {
    console.error(`[Idempotency] Error checking key ${idempotencyKey}:`, error);
    return { exists: false };
  }

  return {
    exists: !!data,
    existingRecord: data,
  };
}

/**
 * Generate booking-specific idempotency key
 */
export function generateBookingKey(
  receptionistId: string,
  serviceId: string,
  startTime: string,
  contact: string
): string {
  return generateIdempotencyKey(null, 'book_appointment', {
    receptionistId,
    serviceId,
    startTime: new Date(startTime).toISOString(),
    contact,
  });
}

/**
 * In-memory cache for tracking in-flight requests within same function instance
 */
const inFlightRequests = new Map<string, Promise<unknown>>();

/**
 * Deduplicate concurrent requests with the same key
 */
export async function deduplicateRequest<T>(
  key: string,
  requestFn: () => Promise<T>,
  ttlMs: number = 5000
): Promise<T> {
  const existing = inFlightRequests.get(key);
  if (existing) {
    console.log(`[Idempotency] Returning existing in-flight request for key: ${key}`);
    return existing as Promise<T>;
  }

  const promise = requestFn().finally(() => {
    // Clean up after TTL
    setTimeout(() => {
      inFlightRequests.delete(key);
    }, ttlMs);
  });

  inFlightRequests.set(key, promise);
  return promise;
}
