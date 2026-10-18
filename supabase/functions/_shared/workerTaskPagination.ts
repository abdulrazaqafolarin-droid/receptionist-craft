export interface WorkerTaskCursor {
  created_at: string;
  id: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseTaskPageSize(value: unknown, defaultSize = 50): number | null {
  if (value === undefined) return defaultSize;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 100) return null;
  return value;
}

export function encodeTaskCursor(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !UUID_PATTERN.test(record.id) ||
      typeof record.created_at !== "string" || !Number.isFinite(Date.parse(record.created_at))) return null;
  const payload = JSON.stringify({ id: record.id, created_at: new Date(record.created_at).toISOString() });
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
        typeof record.created_at !== "string" || !Number.isFinite(Date.parse(record.created_at))) return null;
    return { id: record.id, created_at: new Date(record.created_at).toISOString() };
  } catch {
    return null;
  }
}
