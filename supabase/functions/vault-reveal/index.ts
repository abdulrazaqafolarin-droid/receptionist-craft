/**
 * vault-reveal — return a key's plaintext ONCE for copy. Rate-limited
 * (10/hour), audited, owner-only, CORS-locked. Plaintext travels only
 * this response; it is never stored or logged.
 *
 * Note on step-up auth: Supabase JWTs carry no auth-time claim, so true
 * re-authentication (password/MFA prompt) is not verifiable here. The
 * compensating controls are the tight rate limit, the audit row, and
 * the owner-only gate. The UI adds a confirm dialog before calling.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  vaultCors, vaultCaller, decryptKey, revealAllowed, vaultAudit,
} from "../_shared/vault.ts";

serve(async (req) => {
  const cors = vaultCors(req);
  if (!cors) return new Response("forbidden origin", { status: 403 });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const caller = await vaultCaller(
      req,
      () => createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }),
      (token: string) => createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      }),
    );
    const body = await req.json().catch(() => ({}));
    const key_id = typeof body.key_id === "string" ? body.key_id : "";
    if (!key_id) return json({ error: "key_id required" }, 400);

    if (!(await revealAllowed(caller.service, caller.user_id))) {
      return json({ error: "reveal rate limit reached — try in an hour" }, 429);
    }
    const { data } = await caller.service
      .from("api_keys")
      .select("id,user_id,encrypted_key,iv,status")
      .eq("id", key_id)
      .maybeSingle();
    const row = data as { id: string; user_id: string; encrypted_key: string; iv: string; status: string } | null;
    if (!row || row.user_id !== caller.user_id || row.status !== "active") {
      return json({ error: "key not found" }, 404);
    }
    const plain = await decryptKey(row.encrypted_key, row.iv);
    await vaultAudit(caller.service, { user_id: caller.user_id, key_id: row.id, action: "reveal", ip: caller.ip });
    return json({ ok: true, key: plain });
  } catch (e) {
    const status = (e as { status?: number }).status || 500;
    const msg = status < 500 ? (e instanceof Error ? e.message : "denied") : "vault error";
    return json({ error: msg }, status);
  }
});
