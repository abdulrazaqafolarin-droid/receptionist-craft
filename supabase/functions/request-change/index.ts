import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateChangePlan } from "../_shared/config/enhancedConfigurator.ts";
import { getLatestVersion, getReasoningHistory, saveConfigVersion, type ReasoningHistoryEntry } from "../_shared/config/versioning.ts";
import { RutexMcpError } from "../_shared/rutexMcp.ts";

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
 * request-change — Vision Part Two (conversational management)
 *
 * Owner describes a change in plain language.
 * AI produces:
 * 1. The updated config
 * 2. A plain-language plan showing what will change
 * 3. A draft version for approval
 *
 * Nothing goes live until owner approves.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { change_request, receptionist_id, user_id } = body;

    if (!change_request || typeof change_request !== "string" || !change_request.trim()) {
      return jsonRes({ ok: false, error: "missing_change_request" }, 400);
    }
    if (!receptionist_id || !user_id) {
      return jsonRes({ ok: false, error: "missing_receptionist_id_or_user_id" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""),
    );

    // Verify ownership
    const { data: rec } = await supabase
      .from("receptionists")
      .select("id")
      .eq("id", receptionist_id)
      .eq("user_id", user_id)
      .maybeSingle();

    if (!rec) {
      return jsonRes({ ok: false, error: "not_found" }, 404);
    }

    // Get current config (latest version)
    const latestVersion = await getLatestVersion(supabase, receptionist_id);
    if (!latestVersion) {
      return jsonRes({ ok: false, error: "no_existing_config" }, 400);
    }

    // Step 8 / §4.1b: retrieve the reasoning-history trail ('why' behind each
    // past plan) so the Configurator explains things from memory, not just the
    // final config. Non-fatal — degrade to empty if unavailable.
    let reasoningHistory: ReasoningHistoryEntry[] = [];
    try {
      reasoningHistory = await getReasoningHistory(supabase, receptionist_id, 8);
    } catch {
      reasoningHistory = [];
    }

    // Generate the change plan
    const result = await generateChangePlan(
      latestVersion.config_json,
      change_request.trim(),
      reasoningHistory,
    );

    // Save as a draft version
    const newVersion = await saveConfigVersion(supabase, {
      receptionist_id,
      config_json: result.config,
      plan_text: result.plan.full_text,
      change_source: "owner_change",
      owner_input: change_request.trim(),
      reasoning_notes: result.reasoning_notes || undefined,
    });

    return jsonRes({
      ok: true,
      plan: result.plan,
      config: result.config,
      reasoning_notes: result.reasoning_notes,
      version_id: newVersion.id,
      version_number: newVersion.version_number,
      previous_version: latestVersion.version_number,
    });
  } catch (e) {
    console.error("[request-change] Error:", e);
    if (e instanceof RutexMcpError) {
      const map: Record<string, string> = {
        not_configured: "gateway_not_configured",
        auth: "gateway_auth_failed",
        timeout: "gateway_timeout",
        unreachable: "gateway_unreachable",
        tool_error: "gateway_empty_response",
        protocol: "gateway_protocol_error",
      };
      return jsonRes({ ok: false, error: map[e.kind] ?? "gateway_unreachable", details: String(e).slice(0, 200) }, 502);
    }
    return jsonRes({ ok: false, error: "internal_error", details: String(e).slice(0, 300) }, 500);
  }
});
