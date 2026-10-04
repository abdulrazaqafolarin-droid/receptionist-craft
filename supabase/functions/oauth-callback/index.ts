import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { OAUTH_PROVIDERS, CONNECTOR_SCOPES } from "../_shared/oauthProviders.ts";

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
 * oauth-callback (F3) — exchanges the provider code for tokens and stores
 * them on the owner's connectors row.
 *
 * Auth: caller JWT verified; client_id/secret are read server-side from
 * THEIR row — secrets never transit the browser after initial save.
 * Body: { code, connector_key, redirect_uri } (redirect_uri must match the
 * one sent to oauth-start, or the provider refuses the exchange).
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const svcKey = Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    const supabase = createClient(supabaseUrl, svcKey);
    const { data: { user } } = await createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY") || svcKey,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } },
    ).auth.getUser();
    if (!user) return jsonRes({ ok: false, error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const code = typeof body.code === "string" ? body.code : "";
    const connectorKey = typeof body.connector_key === "string" ? body.connector_key : "";
    const redirectUri = typeof body.redirect_uri === "string" ? body.redirect_uri : "";
    if (!code || !connectorKey || !redirectUri) {
      return jsonRes({ ok: false, error: "missing_code_connector_or_redirect" }, 400);
    }

    const entry = CONNECTOR_SCOPES[connectorKey];
    if (!entry || entry.provider === "none") {
      return jsonRes({ ok: false, error: "connector_not_oauth" }, 400);
    }
    const provider = OAUTH_PROVIDERS[entry.provider];
    if (!provider) return jsonRes({ ok: false, error: "unknown_provider" }, 400);

    const { data: row } = await supabase
      .from("connectors")
      .select("config_json, display_name, category")
      .eq("user_id", user.id)
      .eq("connector_key", connectorKey)
      .maybeSingle() as {
        data: { config_json?: Record<string, string>; display_name?: string; category?: string } | null;
      };
    const cfg = row?.config_json || {};
    const clientId = cfg.client_id || cfg.client_key || "";
    const clientSecret = cfg.client_secret || "";
    if (!clientId || !clientSecret) {
      return jsonRes({ ok: false, error: "missing_client_credentials" }, 400);
    }

    // Exchange code for tokens.
    const form: Record<string, string> = {
      [provider.idParam]: clientId,
      [provider.secretParam]: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    };
    let tokenRes: Response;
    if (provider.bodyFormat === "json") {
      tokenRes = await fetch(provider.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      tokenRes = await fetch(provider.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(form).toString(),
      });
    }
    if (!tokenRes.ok) {
      const detail = (await tokenRes.text()).slice(0, 200);
      console.warn("[oauth-callback] Token exchange failed:", tokenRes.status, detail);
      await supabase.from("connectors").update({ status: "error", last_error: "Token exchange failed" })
        .eq("user_id", user.id).eq("connector_key", connectorKey);
      return jsonRes({ ok: false, error: "exchange_failed" }, 200);
    }
    const tokens = (await tokenRes.json()) as Record<string, unknown>;
    const accessToken = tokens.access_token;
    if (typeof accessToken !== "string" || !accessToken) {
      return jsonRes({ ok: false, error: "no_access_token" }, 200);
    }

    const expiresIn = typeof tokens.expires_in === "number" ? tokens.expires_in : 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const merged: Record<string, string> = { ...cfg };
    merged.access_token = accessToken;
    if (typeof tokens.refresh_token === "string") merged.refresh_token = tokens.refresh_token;
    merged.token_expires_at = expiresAt;
    merged.token_provider = provider.key;

    await supabase.from("connectors").update({
      status: "connected",
      config_json: merged,
      last_error: null,
      connected_at: new Date().toISOString(),
      expires_at: expiresAt,
    }).eq("user_id", user.id).eq("connector_key", connectorKey);

    return jsonRes({ ok: true, expires_at: expiresAt });
  } catch (e) {
    console.error("[oauth-callback] Error:", e);
    return jsonRes({ ok: false, error: "internal_error" }, 500);
  }
});
