/**
 * director-ask — secure human input mid-task (Part 2 / Phase C).
 *
 * The brain cannot ask the owner itself mid-loop, so it opens a
 * request row here and waits; the app's global outlet (subscribed
 * via Realtime) shows a masked bottom-sheet; the owner answers;
 * the waiter picks it up and resumes. Pause is rows, not memory.
 *
 * Three lanes:
 * - Brain (X-Gateway-Key): create + await. Never executes, only queues.
 * - Owner (session JWT): answer + cancel. Credential answers encrypt
 *   straight into the vault (never stored here); OTP answers burn
 *   after first pickup; approvals/choices stay as the audit trail.
 * - Verify: credential answers for known providers run through
 *   verify-connector BEFORE storing — invalid keys come back for
 *   correction, network errors are named as network errors.
 *
 * CORS locked like the vault. Every touch is owner-scoped or
 * gateway-keyed; nothing anonymous passes.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { vaultCors } from "../_shared/vault.ts";
import { validateAnswer, answerDisposition, type AskField, type AskKind } from "../_shared/directorAsk.ts";
import { encryptKey, keyLast4, vaultAudit } from "../_shared/vault.ts";

const MAX_WAIT_MS = 120000;
const POLL_STEP_MS = 2000;

// Providers whose keys can be verified harmlessly before storing.
const VERIFY_MAP: Record<string, { connector: string; creds: (k: string) => Record<string, string> }> = {
  stripe: { connector: "stripe", creds: (k) => ({ api_key: k }) },
  paystack: { connector: "paystack", creds: (k) => ({ api_key: k }) },
  google_maps: { connector: "google_maps", creds: (k) => ({ api_key: k }) },
  yelp: { connector: "yelp", creds: (k) => ({ api_key: k }) },
};

function jsonRes(body: unknown, status = 200, cors: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function keysEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

serve(async (req) => {
  const cors = vaultCors(req);
  if (!cors) return new Response("forbidden origin", { status: 403 });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";

    // ---------- Brain lane ----------
    if (action === "create" || action === "await") {
      const presented = req.headers.get("X-Gateway-Key") || "";
      const expected = Deno.env.get("RUTEX_GATEWAY_KEY") || "";
      if (!keysEqual(presented, expected)) {
        return jsonRes({ ok: false, error: "forbidden" }, 403, cors);
      }
      if (action === "create") {
        const user_id = typeof body.user_id === "string" ? body.user_id : "";
        const kind = typeof body.kind === "string" ? body.kind : "";
        if (!user_id) return jsonRes({ ok: false, error: "user_id required" }, 400, cors);
        if (!["credential", "approval", "otp", "choice", "files"].includes(kind)) {
          return jsonRes({ ok: false, error: "unknown kind" }, 400, cors);
        }
        const fields = (Array.isArray(body.fields) ? body.fields : []).slice(0, 8) as AskField[];
        const ttlMin = Math.min(Math.max(Number(body.ttl_min) || 30, 5), 180);
        const { data, error } = await supabase.from("director_requests").insert({
          user_id,
          session_id: typeof body.session_id === "string" ? body.session_id.slice(0, 120) : "",
          kind,
          title: typeof body.title === "string" ? body.title.slice(0, 120) : "",
          service: typeof body.service === "string" ? body.service.slice(0, 80) : "",
          reason: typeof body.reason === "string" ? body.reason.slice(0, 500) : "",
          purpose: typeof body.purpose === "string" ? body.purpose.slice(0, 500) : "",
          fields,
          expires_at: new Date(Date.now() + ttlMin * 60000).toISOString(),
        }).select("id,expires_at").single();
        if (error || !data) return jsonRes({ ok: false, error: "queue failed" }, 500, cors);
        const row = data as { id: string; expires_at: string };
        return jsonRes({ ok: true, request_id: row.id, expires_at: row.expires_at }, 200, cors);
      }
      // await
      const request_id = typeof body.request_id === "string" ? body.request_id : "";
      if (!request_id) return jsonRes({ ok: false, error: "request_id required" }, 400, cors);
      const waitMs = Math.min(
        typeof body.wait_ms === "number" && body.wait_ms > 0 ? body.wait_ms : 60000,
        MAX_WAIT_MS,
      );
      const deadline = Date.now() + waitMs;
      for (;;) {
        const { data } = await supabase
          .from("director_requests")
          .select("status,answer,kind,expires_at")
          .eq("id", request_id)
          .maybeSingle();
        const row = data as {
          status: string; answer: unknown; kind: AskKind; expires_at: string;
        } | null;
        if (!row) return jsonRes({ ok: false, error: "request vanished" }, 500, cors);
        if (new Date(row.expires_at).getTime() < Date.now() && row.status === "pending") {
          await supabase.from("director_requests").update({ status: "expired" }).eq("id", request_id);
          return jsonRes({ ok: true, status: "expired" }, 200, cors);
        }
        if (row.status === "answered") {
          const disp = answerDisposition(row.kind);
          const answer = row.answer;
          if (disp !== "keep") {
            // Burn BEFORE returning: a failed clear fails closed — the
            // secret is never handed out twice, and never left lying.
            const { error: burnErr } = await supabase
              .from("director_requests")
              .update({ answer: null })
              .eq("id", request_id);
            if (burnErr) {
              return jsonRes({ ok: false, error: "could not clear secret — treat it as compromised and rotate" }, 500, cors);
            }
          }
          return jsonRes({ ok: true, status: "answered", answer, burned: disp !== "keep" }, 200, cors);
        }
        if (row.status === "denied" || row.status === "cancelled" || row.status === "expired") {
          return jsonRes({ ok: true, status: row.status }, 200, cors);
        }
        if (Date.now() >= deadline) {
          return jsonRes({ ok: true, status: "pending", waiting: true }, 200, cors);
        }
        await sleep(POLL_STEP_MS);
      }
    }

    // ---------- Owner lane ----------
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const { data: { user }, error: authError } = await supabase.auth.getUser(token || "invalid");
    if (authError || !user) return jsonRes({ ok: false, error: "invalid token" }, 401, cors);

    const getRow = async (id: string) => {
      const { data } = await supabase
        .from("director_requests")
        .select("id,user_id,kind,status,fields,expires_at")
        .eq("id", id)
        .maybeSingle();
      return data as {
        id: string; user_id: string; kind: AskKind; status: string;
        fields: AskField[]; expires_at: string;
      } | null;
    };

    if (action === "answer") {
      const request_id = typeof body.request_id === "string" ? body.request_id : "";
      if (!request_id) return jsonRes({ ok: false, error: "request_id required" }, 400, cors);
      const row = await getRow(request_id);
      if (!row || row.user_id !== user.id) return jsonRes({ ok: false, error: "request not found" }, 404, cors);
      if (row.status !== "pending") return jsonRes({ ok: false, error: `already ${row.status}` }, 409, cors);
      if (new Date(row.expires_at).getTime() < Date.now()) {
        await supabase.from("director_requests").update({ status: "expired" }).eq("id", request_id);
        return jsonRes({ ok: false, error: "request expired — ask the Director to ask again" }, 410, cors);
      }
      if (body.denied === true) {
        await supabase.from("director_requests")
          .update({ status: "denied", answered_at: new Date().toISOString() })
          .eq("id", request_id);
        return jsonRes({ ok: true, status: "denied" }, 200, cors);
      }
      const values = (body.values && typeof body.values === "object" ? body.values : {}) as Record<string, unknown>;
      const fields = Array.isArray(row.fields) ? row.fields : [];
      const v = validateAnswer(fields, values);
      if (!v.ok) return jsonRes({ ok: false, error: v.errors[0], errors: v.errors }, 422, cors);

      const disp = answerDisposition(row.kind);
      const storeForever = body.store !== false;
      if (disp === "vault" && storeForever) {
        // Credential answers encrypt straight into the vault — the
        // request row NEVER holds plaintext, not even briefly.
        const provider = typeof body.provider === "string" ? body.provider.toLowerCase().slice(0, 40) : "custom";
        const vaultName = typeof body.vault_name === "string" && body.vault_name.trim()
          ? body.vault_name.trim().slice(0, 80)
          : `${provider} key`;
        const secretField = fields.find((f) => f.type === "password") || fields[0];
        const secret = secretField ? String(values[secretField.key] || "") : "";
        if (!secret) return jsonRes({ ok: false, error: "no secret supplied" }, 422, cors);
        const mapping = VERIFY_MAP[provider];
        if (mapping) {
          try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 30000);
            let vr: Response;
            try {
              vr = await fetch(`${url}/functions/v1/verify-connector`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  apikey: Deno.env.get("SUPABASE_ANON_KEY") || "",
                },
                body: JSON.stringify({ connector_key: mapping.connector, credentials: mapping.creds(secret) }),
                signal: ctrl.signal,
              });
            } finally {
              clearTimeout(timer);
            }
            const vd = (await vr.json().catch(() => ({}))) as { ok?: boolean; error?: string; status?: string };
            if (vd.error === "invalid_key" || vd.error === "invalid_credentials") {
              return jsonRes({ ok: false, error: "that key was rejected by the provider — check it and retry" }, 422, cors);
            }
            if (!vr.ok || vd.ok !== true) {
              return jsonRes({ ok: false, error: "provider answered oddly — key not stored, retry" }, 422, cors);
            }
          } catch {
            return jsonRes({ ok: false, error: "could not reach the provider — key not stored, retry" }, 422, cors);
          }
        }
        const { cipher, iv } = await encryptKey(secret);
        const { data: ins, error: insErr } = await supabase.from("api_keys").insert({
          user_id: user.id,
          name: vaultName,
          provider,
          encrypted_key: cipher,
          iv,
          key_last4: keyLast4(secret),
          status: "active",
        }).select("id").single();
        if (insErr || !ins) return jsonRes({ ok: false, error: "store failed — nothing saved" }, 500, cors);
        await supabase.from("vault_audit_logs").insert({
          user_id: user.id,
          key_id: (ins as { id: string }).id,
          action: "create",
          ip: (req.headers.get("x-forwarded-for") || "").split(",")[0].trim().slice(0, 80),
        });
        await supabase.from("director_requests")
          .update({ status: "answered", answered_at: new Date().toISOString() })
          .eq("id", request_id);
        const once = disp === "vault" && !storeForever;
        return jsonRes({ ok: true, status: "answered", stored: once ? "once" : "vault", masked: `••••${keyLast4(secret)}` }, 200, cors);
      }
      // Pass-through (use-once credentials) or plain answers land on the
      // row for exactly one pickup — the waiter burns non-kept answers.
      await supabase.from("director_requests")
        .update({ status: "answered", answer: values, answered_at: new Date().toISOString() })
        .eq("id", request_id);
      return jsonRes({ ok: true, status: "answered", burned: disp === "burn" || (disp === "vault" && !storeForever) }, 200, cors);
    }

    if (action === "cancel") {
      const request_id = typeof body.request_id === "string" ? body.request_id : "";
      if (!request_id) return jsonRes({ ok: false, error: "request_id required" }, 400, cors);
      const row = await getRow(request_id);
      if (!row || row.user_id !== user.id) return jsonRes({ ok: false, error: "request not found" }, 404, cors);
      if (row.status !== "pending") return jsonRes({ ok: false, error: `already ${row.status}` }, 409, cors);
      await supabase.from("director_requests").update({ status: "cancelled" }).eq("id", request_id);
      return jsonRes({ ok: true, status: "cancelled" }, 200, cors);
    }

    if (action === "list") {
      const { data } = await supabase
        .from("director_requests")
        .select("id,kind,title,service,reason,purpose,fields,status,expires_at,created_at")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(10);
      return jsonRes({ ok: true, requests: data || [] }, 200, cors);
    }

    return jsonRes({ ok: false, error: "unknown action" }, 400, cors);
  } catch (e) {
    return jsonRes({ ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "unknown" }, 500, cors);
  }
});
