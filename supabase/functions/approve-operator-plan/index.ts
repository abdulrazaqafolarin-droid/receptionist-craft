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
 * approve-operator-plan — Vision Part One (approval step)
 *
 * Owner has reviewed the plan. Now we:
 * 1. Mark the config version as approved
 * 2. Apply the config to the live receptionist record
 * 3. Save the plan artifact for future reference
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { version_id, receptionist_id, user_id, config, plan_text, owner_feedback } = body;

    if (!version_id || !receptionist_id || !user_id) {
      return jsonRes({ ok: false, error: "missing_required_fields" }, 400);
    }
    if (!config) {
      return jsonRes({ ok: false, error: "missing_config" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
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

    // Mark the config version as approved
    await supabase
      .from("config_versions")
      .update({
        approved_by: user_id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", version_id);

    // Apply config to live receptionist
    const business = (config.business || {}) as Record<string, string>;
    const capabilities = (config.capabilities || {}) as Record<string, unknown>;
    const channels = (config.channels || {}) as Record<string, boolean>;

    const { error: updateErr } = await supabase
      .from("receptionists")
      .update({
        name: business.display_name || undefined,
        business_name: business.display_name || undefined,
        business_type: business.business_type || undefined,
        greeting_message: business.greeting_message || undefined,
        tone: business.tone || undefined,
        capabilities: capabilities,
        // Preserve existing fields that aren't in the config
      })
      .eq("id", receptionist_id);

    if (updateErr) {
      console.error("[approve-operator-plan] Update error:", updateErr);
      return jsonRes({ ok: false, error: "apply_failed" }, 500);
    }

    // Save the plan artifact
    const { error: planErr } = await supabase.from("operator_plans").insert({
      receptionist_id,
      config_version_id: version_id,
      plan_text: plan_text || "",
      plan_sections: JSON.stringify([]),
      status: "approved",
      owner_feedback: owner_feedback || null,
      approved_at: new Date().toISOString(),
    });

    if (planErr) {
      console.warn("[approve-operator-plan] Plan save failed (non-fatal):", planErr);
    }

    // Record config change for quality monitoring (auto-revert protection)
    try {
      const { recordConfigChange } = await import("../_shared/config/qualityMonitor.ts");
      const { data: latestVersion } = await supabase
        .from("config_versions")
        .select("version_number")
        .eq("receptionist_id", receptionist_id)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestVersion) {
        await recordConfigChange(supabase, receptionist_id, latestVersion.version_number);
      }
    } catch (monitorErr) {
      console.warn("[approve-operator-plan] Quality monitor recording failed (non-fatal):", monitorErr);
    }

    return jsonRes({
      ok: true,
      message: "Plan approved and configuration applied",
    });
  } catch (e) {
    console.error("[approve-operator-plan] Error:", e);
    return jsonRes({ ok: false, error: "internal_error" }, 500);
  }
});
