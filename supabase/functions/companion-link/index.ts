/**
 * companion-link — pairing and the companion's work channel (Phase B).
 *
 * Two callers, two auth shapes, one file:
 *
 * Owner (session JWT) — pairing management from the app:
 *   { action: "create_device", name?, platform? }
 *     → creates the row, returns { device_id, secret } ONCE. The secret
 *       is never stored (only its SHA-256) and never shown again.
 *   { action: "set_enabled", device_id, enabled }
 *     → the master switch. Disabled devices get no work. Instant stop.
 *   { action: "revoke_device", device_id }
 *     → deletes the row. Queued commands cascade away unexecuted.
 *
 * Companion (device secret as `Authorization: Bearer rcd_...`):
 *   { action: "poll" }
 *     → oldest queued command for this device (marked running), or
 *       { command: null }. Disabled devices always get null.
 *   { action: "complete", command_id, ok, result?, error? }
 *     → writes the outcome for the brain's next step.
 *   { action: "heartbeat" }
 *     → last_seen bump so the owner sees the device is alive.
 *
 * The companion only ever sees its own rows. Owners only manage their
 * own devices. Secrets are compared as hashes, constant-time.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256hex(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hashEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "rcd_" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";

    // --- Companion lane: device secret ---
    if (bearer.startsWith("rcd_")) {
      const hash = await sha256hex(bearer);
      const { data: devRows } = await supabase
        .from("companion_devices")
        .select("id,user_id,enabled,secret_hash")
        .eq("secret_hash", hash)
        .limit(1);
      const dev = (Array.isArray(devRows) ? devRows : [])[0] as
        | { id: string; user_id: string; enabled: boolean; secret_hash: string } | undefined;
      if (!dev || !hashEqual(dev.secret_hash, hash)) {
        return jsonRes({ ok: false, error: "forbidden" }, 403);
      }
      await supabase.from("companion_devices").update({ last_seen: new Date().toISOString() }).eq("id", dev.id);

      if (action === "heartbeat") return jsonRes({ ok: true, enabled: dev.enabled });
      if (!dev.enabled) return jsonRes({ ok: true, command: null, disabled: true });

      if (action === "poll") {
        const { data: rows } = await supabase
          .from("director_commands")
          .select("id,tool,args")
          .eq("device_id", dev.id)
          .eq("status", "queued")
          .order("created_at", { ascending: true })
          .limit(1);
        const cmd = (Array.isArray(rows) ? rows : [])[0] as
          | { id: string; tool: string; args: unknown } | undefined;
        if (!cmd) return jsonRes({ ok: true, command: null });
        await supabase.from("director_commands").update({ status: "running" }).eq("id", cmd.id);
        return jsonRes({ ok: true, command: { id: cmd.id, tool: cmd.tool, args: cmd.args ?? {} } });
      }

      if (action === "complete") {
        const command_id = typeof body.command_id === "string" ? body.command_id : "";
        if (!command_id) return jsonRes({ ok: false, error: "command_id required" }, 400);
        const { data: row } = await supabase
          .from("director_commands")
          .select("id,device_id")
          .eq("id", command_id)
          .maybeSingle();
        const owned = row as { id: string; device_id: string | null } | null;
        if (!owned || owned.device_id !== dev.id) {
          return jsonRes({ ok: false, error: "not your command" }, 403);
        }
        const ok = body.ok === true;
        await supabase.from("director_commands").update({
          status: ok ? "done" : "failed",
          result: body.result !== undefined ? body.result : null,
          error: typeof body.error === "string" ? body.error.slice(0, 500) : null,
          finished_at: new Date().toISOString(),
        }).eq("id", command_id);
        return jsonRes({ ok: true });
      }
      return jsonRes({ ok: false, error: "action must be poll, complete, or heartbeat" }, 400);
    }

    // --- Owner lane: session JWT ---
    const { data: { user }, error: authError } = await supabase.auth.getUser(bearer);
    if (authError || !user) return jsonRes({ ok: false, error: "invalid token" }, 401);

    if (action === "create_device") {
      const name = (typeof body.name === "string" && body.name.trim() ? body.name.trim() : "My computer").slice(0, 60);
      const platform = body.platform === "macos" || body.platform === "android" ? body.platform : "windows";
      const secret = randomSecret();
      const { data, error } = await supabase.from("companion_devices").insert({
        user_id: user.id,
        name,
        platform,
        secret_hash: await sha256hex(secret),
        enabled: true,
      }).select("id").single();
      if (error || !data) return jsonRes({ ok: false, error: "pair failed" }, 500);
      return jsonRes({ ok: true, device_id: (data as { id: string }).id, secret });
    }

    if (action === "set_enabled" || action === "revoke_device") {
      const device_id = typeof body.device_id === "string" ? body.device_id : "";
      if (!device_id) return jsonRes({ ok: false, error: "device_id required" }, 400);
      const { data: row } = await supabase
        .from("companion_devices")
        .select("id,user_id")
        .eq("id", device_id)
        .maybeSingle();
      const owned = row as { id: string; user_id: string } | null;
      if (!owned || owned.user_id !== user.id) return jsonRes({ ok: false, error: "not your device" }, 403);
      if (action === "set_enabled") {
        await supabase.from("companion_devices").update({ enabled: body.enabled === true }).eq("id", device_id);
      } else {
        await supabase.from("companion_devices").delete().eq("id", device_id);
      }
      return jsonRes({ ok: true });
    }

    if (action === "list_devices") {
      const { data } = await supabase
        .from("companion_devices")
        .select("id,name,platform,enabled,last_seen,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return jsonRes({ ok: true, devices: data || [] });
    }

    return jsonRes({ ok: false, error: "unknown action" }, 400);
  } catch (e) {
    return jsonRes({ ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "unknown" }, 500);
  }
});
