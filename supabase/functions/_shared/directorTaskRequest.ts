/**
 * Safely read a Director task request body exactly once.
 *
 * Request.json() consumes the request stream. Parse it before authentication
 * branches so gateway identity and the requested action can share the same
 * validated object instead of accidentally parsing an already-consumed body.
 */
export async function parseDirectorTaskBody(req: Request): Promise<Record<string, unknown>> {
  const value: unknown = await req.json().catch(() => ({}));
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
