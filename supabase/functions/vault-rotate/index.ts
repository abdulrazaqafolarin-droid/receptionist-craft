/**
 * vault-rotate — replace a key's ciphertext with a new key. Old value is
 * overwritten, never retained. Audited, owner-only, CORS-locked.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  vaultCors, vaultCaller, encryptKey, keyLast4, vaultAudit,
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
    const key = typeof body.key === "string" ? body.key.trim() : "";
    if (!key_id) return json({ error: "key_id required" }, 400);
    if (key.length < 8) return json({ error: "key too short" }, 400);

    const { data } = await caller.service
      .from("api_keys")
      .select("id,user_id,status")
      .eq("id", key_id)
      .maybeSingle();
    const row = data as { id: string; user_id: string; status: string } | null;
    if (!row || row.user_id !== caller.user_id || row.status !== "active") {
      return json({ error: "key not found" }, 404);
    }
    const { cipher, iv } = await encryptKey(key);
    const { error } = await caller.service.from("api_keys").update({
      encrypted_key: cipher,
      iv,
      key_last4: keyLast4(key),
    }).eq("id", key_id);
    if (error) return json({ error: "rotate failed" }, 500);
    await vaultAudit(caller.service, { user_id: caller.user_id, key_id, action: "rotate", ip: caller.ip });
    return json({ ok: true, key_last4: keyLast4(key) });
  } catch (e) {
    const status = (e as { status?: number }).status || 500;
    const msg = status < 500 ? (e instanceof Error ? e.message : "denied") : "vault error";
    return json({ error: msg }, status);
  }
});
