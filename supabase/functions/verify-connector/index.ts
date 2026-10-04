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
      return jsonRes({ ok: true, detail: bal.livemode === true ? "live" : "test" });
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
      return jsonRes({ ok: true, detail: "verified" });
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
      return jsonRes({ ok: true, detail: acct.friendly_name || "verified" });
    }

    // Custom SMTP — no safe server-side test without sending real mail.
    // Saved as configured; the owner sends a real test from their app.
    if (key === "smtp_custom") {
      const host = str(creds.host);
      const user = str(creds.username);
      if (!host || !user) return jsonRes({ ok: false, error: "need_host_and_username" }, 400);
      return jsonRes({ ok: true, detail: "saved — send a test email from your app to confirm" });
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
      return jsonRes({ ok: true, detail: "verified" });
    }

    return jsonRes({ ok: false, error: "unsupported_connector", detail: `${key} verifies via OAuth, not keys` }, 400);
  } catch (e) {
    console.error("[verify-connector] Error:", e);
    return jsonRes({ ok: false, error: "internal_error" }, 500);
  }
});
