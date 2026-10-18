/**
 * Shared fail-closed authentication for privileged cron-triggered Edge Functions.
 *
 * Supabase publishable/anon keys are public identifiers, not scheduler secrets.
 * The caller must provide a separately managed RUTEX_INTERNAL_CRON_SECRET.
 */
const HEADER = "x-rutex-cron-secret";
const MIN_SECRET_BYTES = 32;

function constantTimeSecretMatch(expected: string, provided: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(expected);
  const b = encoder.encode(provided);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return difference === 0;
}

/**
 * Returns null when authorized; otherwise returns a safe HTTP error response.
 * Missing/weak server configuration fails closed with 503 instead of opening
 * the privileged endpoint or silently breaking the auth requirement.
 */
export function authorizeInternalCron(req: Request, expectedSecret: string | undefined): Response | null {
  if (!expectedSecret || new TextEncoder().encode(expectedSecret).length < MIN_SECRET_BYTES) {
    return new Response(JSON.stringify({
      ok: false,
      error: "internal_auth_not_configured",
    }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const provided = req.headers.get(HEADER) ?? "";
  if (!constantTimeSecretMatch(expectedSecret, provided)) {
    return new Response(JSON.stringify({
      ok: false,
      error: "unauthorized",
    }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return null;
}

export const INTERNAL_CRON_HEADER = HEADER;
