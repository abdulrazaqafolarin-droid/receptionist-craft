/**
 * Authenticate owner-facing Edge Function requests.
 *
 * These endpoints may have gateway JWT verification disabled, so they must
 * validate the bearer token themselves before trusting any user_id in JSON.
 */
export class RequestAuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "RequestAuthError";
    this.status = status;
  }
}

export interface AuthLookupClient {
  auth: {
    getUser(token: string): Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
  };
}

export async function requireAuthenticatedUserId(
  req: Request,
  authClient: AuthLookupClient,
): Promise<string> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new RequestAuthError("missing authorization", 401);

  let result: Awaited<ReturnType<AuthLookupClient["auth"]["getUser"]>>;
  try {
    result = await authClient.auth.getUser(token);
  } catch {
    throw new RequestAuthError("invalid token", 401);
  }
  if (result.error || !result.data.user?.id) {
    throw new RequestAuthError("invalid token", 401);
  }
  return result.data.user.id;
}
