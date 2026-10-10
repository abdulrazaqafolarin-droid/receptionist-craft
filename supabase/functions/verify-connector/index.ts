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

/**
 * verify-connector (F3) — server-side credential check for api_key
 * connectors. Browser CORS forbids calling Stripe/Paystack/Twilio APIs
 * from the frontend, so verification happens here.
 *
 * The key passes THROUGH (never stored server-side, never logged). Only
 * a boolean + provider identity comes back; the frontend upserts the
 * connectors row itself under owner RLS.
 *
 * Body: { connector_key, credentials: { api_key?, account_sid?, ... } }
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const key = typeof body.connector_key === "string" ? body.connector_key : "";
    const creds = (body.credentials || {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

    if (!key) return jsonRes({ ok: false, error: "missing_connector_key" }, 400);

    // Stripe — secret key authenticates a balance read (no charges possible).
    if (key === "stripe") {
      const sk = str(creds.api_key);
      if (!sk.startsWith("sk_")) return jsonRes({ ok: false, error: "not_a_stripe_secret_key" }, 400);
      const res = await fetch("https://api.stripe.com/v1/balance", {
        headers: { Authorization: `Bearer ${sk}` },
      });
      if (res.status === 401) return jsonRes({ ok: false, error: "invalid_key" }, 200);
      if (!res.ok) return jsonRes({ ok: false, error: `stripe_http_${res.status}` }, 200);
      const bal = (await res.json()) as { livemode?: boolean };
      return jsonRes({ ok: true, status: "connected", detail: bal.livemode === true ? "live" : "test" });
    }

    // Paystack — secret key authenticates a balance read.
    if (key === "paystack") {
      const sk = str(creds.api_key);
      if (!sk.startsWith("sk_")) return jsonRes({ ok: false, error: "not_a_paystack_secret_key" }, 400);
      const res = await fetch("https://api.paystack.co/balance", {
        headers: { Authorization: `Bearer ${sk}` },
      });
      if (res.status === 401) return jsonRes({ ok: false, error: "invalid_key" }, 200);
      if (!res.ok) return jsonRes({ ok: false, error: `paystack_http_${res.status}` }, 200);
      return jsonRes({ ok: true, status: "connected", detail: "verified" });
    }

    // Twilio — Account SID + Auth Token via basic auth on the account itself.
    if (key === "twilio_sms") {
      const sid = str(creds.account_sid);
      const token = str(creds.auth_token);
      if (!sid.startsWith("AC") || !token) return jsonRes({ ok: false, error: "need_account_sid_and_auth_token" }, 400);
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
        headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}` },
      });
      if (res.status === 401) return jsonRes({ ok: false, error: "invalid_credentials" }, 200);
      if (!res.ok) return jsonRes({ ok: false, error: `twilio_http_${res.status}` }, 200);
      const acct = (await res.json()) as { friendly_name?: string };
      return jsonRes({ ok: true, status: "connected", detail: acct.friendly_name || "verified" });
    }

    // Custom SMTP — no safe server-side test without sending real mail.
    // Saved as configured; the owner sends a real test from their app.
    if (key === "smtp_custom") {
      const host = str(creds.host);
      const user = str(creds.username);
      if (!host || !user) return jsonRes({ ok: false, error: "need_host_and_username" }, 400);
      return jsonRes({ ok: true, status: "configured", detail: "saved — send a test email from your app to confirm" });
    }

    // Google Maps — API key validated against geocoding (cheap, no side effects).
    if (key === "google_maps") {
      const gk = str(creds.api_key);
      if (!gk) return jsonRes({ ok: false, error: "missing_key" }, 400);
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=Lagos&key=${encodeURIComponent(gk)}`,
      );
      if (!res.ok) return jsonRes({ ok: false, error: `google_http_${res.status}` }, 200);
      const data = (await res.json()) as { status?: string; error_message?: string };
      if (data.status === "REQUEST_DENIED") return jsonRes({ ok: false, error: "invalid_key", detail: data.error_message || "" }, 200);
      return jsonRes({ ok: true, status: "connected", detail: "verified" });
    }

    // Yelp Fusion — a keyless-shape request returns 400 (key accepted) vs
    // 401 (bad key). No side effects either way.
    if (key === "yelp") {
      const yk = str(creds.api_key);
      if (!yk) return jsonRes({ ok: false, error: "missing_key" }, 400);
      const res = await fetch("https://api.yelp.com/v3/businesses/search", {
        headers: { Authorization: `Bearer ${yk}` },
      });
      if (res.status === 401 || res.status === 403) return jsonRes({ ok: false, error: "invalid_key" }, 200);
      return jsonRes({ ok: true, status: "connected", detail: "verified" });
    }

    // Trustpilot — per-business-unit auth cannot be probed safely without a
    // business context. Saved as configured; first real use confirms it.
    if (key === "trustpilot") {
      const tk = str(creds.api_key);
      if (!tk) return jsonRes({ ok: false, error: "missing_key" }, 400);
      return jsonRes({ ok: true, status: "configured", detail: "saved — first review check confirms it" });
    }

    // CLI-harness connectors (anything-CLI pattern): the check command
    // runs on the owner's paired runner — never in the browser, never
    // here. No runner means honestly-pending, never faked. A refused or
    // failing check saves configured with the real stderr, so the owner
    // sees what actually happened instead of a green lie.
    if (typeof creds.cli_command === "string" && creds.cli_command.trim()) {
      const checkCmd = creds.cli_command.trim().slice(0, 2000);
      const user_id = typeof body.user_id === "string" ? body.user_id : "";
      if (!user_id) {
        return jsonRes({ ok: true, status: "configured", detail: "saved — sign in to verify through your runner" });
      }
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          (Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""),
          { auth: { autoRefreshToken: false, persistSession: false } },
        );
        const { data: devRows } = await supabase
          .from("companion_devices")
          .select("id")
          .eq("user_id", user_id)
          .eq("platform", "runner")
          .eq("enabled", true)
          .order("last_seen", { ascending: false, nullsFirst: false })
          .limit(1);
        const dev = (Array.isArray(devRows) ? devRows : [])[0] as { id: string } | undefined;
        if (!dev) {
          return jsonRes({ ok: true, status: "configured", detail: "saved — pair a Runner in Director > Computers to verify" });
        }
        const { data: cmd, error: qErr } = await supabase.from("director_commands").insert({
          user_id,
          session_id: `verify-${key}`.slice(0, 120),
          device_id: dev.id,
          tool: "run_cli",
          args: { command: checkCmd, timeout: 45 },
          status: "queued",
        }).select("id").single();
        if (qErr || !cmd) {
          return jsonRes({ ok: true, status: "configured", detail: "saved — could not queue the check, will retry on next use" });
        }
        const commandId = (cmd as { id: string }).id;
        const deadline = Date.now() + 60000;
        for (;;) {
          const { data: row } = await supabase
            .from("director_commands")
            .select("status,result,error")
            .eq("id", commandId)
            .maybeSingle();
          const st = row as { status: string; result: unknown; error: string | null } | null;
          if (!st) {
            return jsonRes({ ok: true, status: "configured", detail: "saved — check vanished, will retry on next use" });
          }
          if (st.status === "done" || st.status === "failed") {
            const res = (st.result || {}) as { exit_code?: number | null; stdout?: string; stderr?: string; timed_out?: boolean };
            if (st.status === "done" && res.exit_code === 0 && !res.timed_out) {
              const snippet = String(res.stdout || "").trim().slice(0, 160);
              return jsonRes({ ok: true, status: "connected", detail: snippet ? `check passed — ${snippet}` : "check passed" });
            }
            const why = res.timed_out
              ? "check timed out"
              : st.status === "failed"
                ? String(st.error || "runner refused it").slice(0, 160)
                : `exit ${res.exit_code ?? "?"}: ${String(res.stderr || res.stdout || "").trim().slice(0, 160)}`;
            return jsonRes({ ok: true, status: "configured", detail: `saved — ${why}` });
          }
          if (Date.now() >= deadline) {
            return jsonRes({ ok: true, status: "configured", detail: "saved — runner didn't answer in 60s, is it running?" });
          }
          await new Promise((r) => setTimeout(r, 1500));
        }
      } catch {
        return jsonRes({ ok: true, status: "configured", detail: "saved — verification hiccup, will retry on next use" });
      }
    }

    return jsonRes({ ok: false, error: "unsupported_connector", detail: `${key} verifies via OAuth, not keys` }, 400);
  } catch (e) {
    console.error("[verify-connector] Error:", e);
    return jsonRes({ ok: false, error: "internal_error" }, 500);
  }
});
