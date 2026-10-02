import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { knownPageKeys } from "../_shared/config/surfaceManifest.ts";
import { saveConfigVersion } from "../_shared/config/versioning.ts";

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
    let { version_id, receptionist_id, user_id, config, plan_text, owner_feedback } = body;

    if (!receptionist_id || !user_id) {
      return jsonRes({ ok: false, error: "missing_required_fields" }, 400);
    }
    if (!config) {
      return jsonRes({ ok: false, error: "missing_config" }, 400);
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

    // Offline drafts arrive with no version row (owners cannot insert
    // config_versions under RLS) — snapshot one server-side first so the
    // approval trail stays complete.
    if (!version_id) {
      const created = await saveConfigVersion(supabase, {
        receptionist_id,
        config_json: (config || {}) as Record<string, unknown>,
        plan_text: typeof plan_text === "string" ? plan_text : "",
        change_source: "offline_draft",
        owner_input: typeof owner_feedback === "string" ? owner_feedback : undefined,
      });
      version_id = created.id;
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

    // Validate + persist the approved dashboard surface (approval-first:
    // the surface only lands here because the owner approved the plan).
    // Unknown page keys are rejected — the AI may only use manifest keys.
    const uiPlan = (config.ui_plan || {}) as {
      show?: Array<{ key?: unknown; why?: unknown }>;
      hide?: Array<{ key?: unknown; why?: unknown }>;
      widget_pieces?: Record<string, unknown>;
    };
    const known = new Set(knownPageKeys());
    const cleanKeys = (list: Array<{ key?: unknown }> | undefined): string[] => {
      const out: string[] = [];
      for (const item of list || []) {
        if (typeof item?.key === "string" && known.has(item.key) && !out.includes(item.key)) {
          out.push(item.key);
        }
      }
      return out;
    };
    const shownKeys = cleanKeys(uiPlan.show);
    const hiddenKeys = cleanKeys(uiPlan.hide);
    const unknownKeys = [...(uiPlan.show || []), ...(uiPlan.hide || [])]
      .map((i) => i?.key)
      .filter((k): k is string => typeof k === "string" && !known.has(k));
    if (unknownKeys.length > 0) {
      return jsonRes({ ok: false, error: "unknown_surface_keys", keys: [...new Set(unknownKeys)] }, 400);
    }
    if (shownKeys.length > 0 || hiddenKeys.length > 0) {
      // Customer-facing widget pieces: strict booleans only, derived from the
      // approved ui_plan when present, else from the approved workflows.
      const workflows = (config.workflows || {}) as Record<string, { enabled?: boolean }>;
      const wp = (uiPlan.widget_pieces || {}) as Record<string, unknown>;
      const bool = (v: unknown, fallback: boolean) => typeof v === "boolean" ? v : fallback;
      const bookingOn = workflows.appointment_booking?.enabled === true;
      const orderingOn = workflows.product_ordering?.enabled === true;
      capabilities.ui_surface = {
        visible_pages: shownKeys,
        widget: {
          booking: bool(wp.booking, bookingOn),
          ordering: bool(wp.ordering, orderingOn),
          voice: bool(wp.voice, true),
          lead_capture: bool(wp.lead_capture, bookingOn || orderingOn),
        },
        version: 1,
        approved_at: new Date().toISOString(),
      };
    }
    const knowledgeBase =
      typeof config.knowledge_base === "string" && config.knowledge_base.trim()
        ? config.knowledge_base.trim()
        : undefined;

    const { error: updateErr } = await supabase
      .from("receptionists")
      .update({
        name: business.display_name || undefined,
        business_name: business.display_name || undefined,
        business_type: business.business_type || undefined,
        greeting_message: business.greeting_message || undefined,
        tone: business.tone || undefined,
        capabilities: capabilities,
        knowledge_base: knowledgeBase,
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
