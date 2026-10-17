import { requireAuthenticatedUserId, RequestAuthError } from "./ownerAuth.ts";

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

Deno.test("rejects missing bearer token before looking up a user", async () => {
  let called = false;
  const client = { auth: { getUser: async () => {
    called = true;
    return { data: { user: { id: "user-a" } }, error: null };
  } } };
  try {
    await requireAuthenticatedUserId(new Request("https://example.test"), client);
    throw new Error("expected missing token rejection");
  } catch (e) {
    check(e instanceof RequestAuthError && e.status === 401, "missing token is 401");
  }
  check(!called, "lookup is not called without token");
});

Deno.test("returns the verified user id, not a body-supplied identity", async () => {
  let receivedToken = "";
  const client = { auth: { getUser: async (token: string) => {
    receivedToken = token;
    return { data: { user: { id: "verified-user" } }, error: null };
  } } };
  const req = new Request("https://example.test", {
    headers: { Authorization: "Bearer signed-user-token" },
  });
  const id = await requireAuthenticatedUserId(req, client);
  check(id === "verified-user", "returns provider-verified user id");
  check(receivedToken === "signed-user-token", "passes bearer token to auth lookup");
});

Deno.test("rejects invalid token and auth lookup failures", async () => {
  const invalidClient = { auth: { getUser: async () => ({
    data: { user: null }, error: new Error("invalid"),
  }) } };
  try {
    await requireAuthenticatedUserId(new Request("https://example.test", {
      headers: { Authorization: "Bearer invalid-token" },
    }), invalidClient);
    throw new Error("expected invalid token rejection");
  } catch (e) {
    check(e instanceof RequestAuthError && e.status === 401, "invalid token is 401");
  }

  const throwingClient = { auth: { getUser: async () => { throw new Error("network"); } } };
  try {
    await requireAuthenticatedUserId(new Request("https://example.test", {
      headers: { Authorization: "Bearer token" },
    }), throwingClient);
    throw new Error("expected lookup failure rejection");
  } catch (e) {
    check(e instanceof RequestAuthError && e.status === 401, "lookup failure fails closed");
  }
});
