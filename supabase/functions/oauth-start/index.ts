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
 * oauth-start (F3) — builds the provider authorize URL for a connector.
 *
 * Auth: the caller's Supabase JWT is verified (getUser), so the client_id
 * comes from THEIR connectors row — no credential transit, no spoofing.
 * Body: { connector_key, redirect_uri }
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
    const connectorKey = typeof body.connector_key === "string" ? body.connector_key : "";
    const redirectUri = typeof body.redirect_uri === "string" ? body.redirect_uri : "";
    if (!connectorKey || !redirectUri) {
      return jsonRes({ ok: false, error: "missing_connector_key_or_redirect_uri" }, 400);
    }

    const entry = CONNECTOR_SCOPES[connectorKey];
    if (!entry || entry.provider === "none") {
      return jsonRes({ ok: false, error: "connector_not_oauth" }, 400);
    }
    const provider = OAUTH_PROVIDERS[entry.provider];
    if (!provider) return jsonRes({ ok: false, error: "unknown_provider" }, 400);

    // Owner's own app credentials, saved via the connect dialog.
    const { data: row } = await supabase
      .from("connectors")
      .select("config_json")
      .eq("user_id", user.id)
      .eq("connector_key", connectorKey)
      .maybeSingle() as { data: { config_json?: Record<string, string> } | null };
    const clientId = row?.config_json?.client_id || row?.config_json?.client_key || "";
    if (!clientId) {
      return jsonRes({ ok: false, error: "missing_client_credentials", detail: "Save the provider app Client ID first." }, 400);
    }

    const params = new URLSearchParams({
      [provider.idParam]: clientId,
      redirect_uri: redirectUri,
      scope: entry.scopes.join(entry.joiner),
      state: connectorKey,
      ...provider.extraAuthorize,
    });
    return jsonRes({ ok: true, authorize_url: `${provider.authorizeUrl}?${params.toString()}` });
  } catch (e) {
    console.error("[oauth-start] Error:", e);
    return jsonRes({ ok: false, error: "internal_error" }, 500);
  }
});
