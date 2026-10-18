export interface WorkerTaskCursor {
  created_at: string;
  id: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMESTAMP_PATTERN = /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,6})?(?:Z|[+-]\\d{2}:\\d{2})$/;

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && TIMESTAMP_PATTERN.test(value) && Number.isFinite(Date.parse(value));
}

export function parseTaskPageSize(value: unknown, defaultSize = 50): number | null {
  if (value === undefined) return defaultSize;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 100) return null;
  return value;
}

export function encodeTaskCursor(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !UUID_PATTERN.test(record.id) ||
      !isTimestamp(record.created_at)) return null;
  // Preserve the original fractional precision; converting through Date would
  // truncate PostgreSQL microseconds and could skip tasks sharing a cursor time.
  const payload = JSON.stringify({ id: record.id, created_at: record.created_at });
  return btoa(payload).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeTaskCursor(value: unknown): WorkerTaskCursor | null {
  if (typeof value !== "string" || value.length < 1 || value.length > 512 ||
      !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
    const parsed: unknown = JSON.parse(atob(padded));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.id !== "string" || !UUID_PATTERN.test(record.id) ||
        !isTimestamp(record.created_at)) return null;
    return { id: record.id, created_at: record.created_at };
  } catch {
    return null;
  }
}
