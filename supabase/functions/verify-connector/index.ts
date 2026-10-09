import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

    // CLI-harness connectors (anything-CLI pattern): the command runs where
    // a shell exists (companion app or gateway runner) — never in the
    // browser, never here. If a runner endpoint is configured, probe it;
    // otherwise save honestly as pending instead of faking a connection.
    if (typeof creds.cli_command === "string" && creds.cli_command.trim()) {
      const runnerUrl = (Deno.env.get("RUTEX_RUNNER_URL") || "").replace(/\/$/, "");
      if (runnerUrl) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 15000);
          let probe: Response;
          try {
            probe = await fetch(`${runnerUrl}/run`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ command: "check", connector_key: key }),
              signal: ctrl.signal,
            });
          } finally {
            clearTimeout(timer);
          }
          if (probe.ok) {
            return jsonRes({ ok: true, status: "connected", detail: "runner reachable — commands execute on next use" });
          }
          return jsonRes({ ok: true, status: "configured", detail: "saved — runner answered with an error, will retry on next use" });
        } catch {
          return jsonRes({ ok: true, status: "configured", detail: "saved — runner unreachable right now, will retry on next use" });
        }
      }
      return jsonRes({ ok: true, status: "configured", detail: "saved — runs when your companion or gateway runner connects" });
    }

    return jsonRes({ ok: false, error: "unsupported_connector", detail: `${key} verifies via OAuth, not keys` }, 400);
  } catch (e) {
    console.error("[verify-connector] Error:", e);
    return jsonRes({ ok: false, error: "internal_error" }, 500);
  }
});
