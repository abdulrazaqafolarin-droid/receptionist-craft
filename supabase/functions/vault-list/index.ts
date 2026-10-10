/**
 * vault-list — masked keys for the vault UI. Reads the safe view with
 * the CALLER's token (RLS), so ciphertext is unreachable by construction:
 * the view does not contain it. Owner-only, CORS-locked.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { vaultCors, vaultCaller } from "../_shared/vault.ts";

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
    const { data, error } = await caller.userDb
      .from("vault_keys_safe")
      .select("id,name,provider,key_last4,status,created_at,last_used_at,expires_at")
      .order("created_at", { ascending: false });
    if (error) return json({ error: "list failed" }, 500);
    return json({ ok: true, keys: data || [] });
  } catch (e) {
    const status = (e as { status?: number }).status || 500;
    const msg = status < 500 ? (e instanceof Error ? e.message : "denied") : "vault error";
    return json({ error: msg }, status);
  }
});
