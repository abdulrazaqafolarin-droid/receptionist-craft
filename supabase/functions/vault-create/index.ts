/**
 * vault-create — store a provider key. Encrypts server-side, returns
 * masked metadata only. Plaintext never stored, never logged, never
 * returned. Owner-only, rate-limited, audited, CORS-locked.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  vaultCors, vaultCaller, encryptKey, keyLast4, createAllowed, vaultAudit,
} from "../_shared/vault.ts";

const PROVIDERS = [
  "elevenlabs", "assemblyai", "resend", "google", "openai",
  "paystack", "stripe", "whatsapp", "resend", "custom",
];

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
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    const provider = typeof body.provider === "string" ? body.provider.trim().toLowerCase().slice(0, 40) : "";
    const key = typeof body.key === "string" ? body.key.trim() : "";
    if (!name) return json({ error: "name required" }, 400);
    if (!PROVIDERS.includes(provider)) return json({ error: "unknown provider" }, 400);
    if (key.length < 8) return json({ error: "key too short" }, 400);

    if (!(await createAllowed(caller.service, caller.user_id))) {
      return json({ error: "create rate limit reached — try tomorrow" }, 429);
    }
    const { cipher, iv } = await encryptKey(key);
    const { data, error } = await caller.service.from("api_keys").insert({
      user_id: caller.user_id,
      name,
      provider,
      encrypted_key: cipher,
      iv,
      key_last4: keyLast4(key),
      status: "active",
    }).select("id,name,provider,key_last4,status,created_at").single();
    if (error || !data) return json({ error: "store failed" }, 500);
    await vaultAudit(caller.service, {
      user_id: caller.user_id,
      key_id: (data as { id: string }).id,
      action: "create",
      ip: caller.ip,
    });
    return json({ ok: true, key: data });
  } catch (e) {
    const status = (e as { status?: number }).status || 500;
    const msg = status < 500 ? (e instanceof Error ? e.message : "denied") : "vault error";
    return json({ error: msg }, status);
  }
});
