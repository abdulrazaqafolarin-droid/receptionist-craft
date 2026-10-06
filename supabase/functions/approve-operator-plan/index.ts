import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { knownPageKeys } from "../_shared/config/surfaceManifest.ts";
import { saveConfigVersion } from "../_shared/config/versioning.ts";
import { researchNeeds } from "../_shared/config/solutionResearch.ts";
import { TraceCollector } from "../_shared/config/trace.ts";

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

  // Collector lives outside try so the trace survives failure.
  const trace = new TraceCollector();
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
    void channels;

    // Validate + persist the approved dashboard surface (approval-first:
    // the surface only lands here because the owner approved the plan).
    // Unknown page keys are rejected — the AI may only use manifest keys.
    trace.start("validate-surface");

    // Validate + persist the approved dashboard surface (approval-first:
    // the surface only lands here because the owner approved the plan).
    // Unknown page keys are rejected — the AI may only use manifest keys.
    const uiPlan = (config.ui_plan || {}) as {
      show?: Array<{ key?: unknown; why?: unknown }>;
      hide?: Array<{ key?: unknown; why?: unknown }>;
      widget_pieces?: Record<string, unknown>;
    };
    const known = new Set(knownPageKeys());
    // Accept both shapes: {key, why} objects (spec) and bare strings
    // (models compress under size discipline). Anything unlisted is ignored.
    const asKey = (item: unknown): string | null => {
      if (typeof item === "string") return item;
      if (!!item && typeof item === "object") {
        const k = (item as Record<string, unknown>).key;
        return typeof k === "string" ? k : null;
      }
      return null;
    };
    const cleanKeys = (list: Array<unknown> | undefined): string[] => {
      const out: string[] = [];
      for (const item of list || []) {
        const k = asKey(item);
        if (k && known.has(k) && !out.includes(k)) out.push(k);
      }
      return out;
    };
    const shownKeys = cleanKeys(uiPlan.show);
    const hiddenKeys = cleanKeys(uiPlan.hide);
    const unknownKeys = [...(uiPlan.show || []), ...(uiPlan.hide || [])]
      .map((i) => asKey(i))
      .filter((k): k is string => !!k && !known.has(k));
    // Unknown keys are IGNORED, never blocking: cleanKeys already excluded
    // them from visible_pages, so they change nothing. A 400 here once
    // blocked a good plan over a harmless extra hide entry — approval must
    // fail only on real problems. The ignored keys are recorded in the trace.
    const ignored = [...new Set(unknownKeys)];
    trace.end("validate-surface", "Dashboard surface validated against manifest", [
      `${shownKeys.length} pages shown`,
      `${hiddenKeys.length} hidden`,
      ...(ignored.length > 0 ? [`ignored unknown: ${ignored.join(", ")}`] : []),
    ]);
    // Workflow flags drive widget pieces AND the catalog model — computed
    // once here (function scope) so both the surface write and the row
    // update below agree, with or without a ui_plan present.
    const workflows = (config.workflows || {}) as Record<string, { enabled?: boolean }>;
    const bookingOn = workflows.appointment_booking?.enabled === true;
    const orderingOn = workflows.product_ordering?.enabled === true;
    if (shownKeys.length > 0 || hiddenKeys.length > 0) {
      // Customer-facing widget pieces: strict booleans only, derived from the
      // approved ui_plan when present, else from the approved workflows.
      const wp = (uiPlan.widget_pieces || {}) as Record<string, unknown>;
      const bool = (v: unknown, fallback: boolean) => typeof v === "boolean" ? v : fallback;
      // Persist researched solutions (informational — the Connections page
      // reads these so the owner sees free options first). Lightly validated.
      // If the draft arrived without solutions (request-change deferred them
      // on a spent time budget), research here: approval makes no AI call,
      // so the 150s budget is all ours.
      let rawSolutions = (config.external_solutions || []) as unknown[];
      if (rawSolutions.length === 0) {
        const needs = (config.external_needs || []) as unknown[];
        const names = needs.filter((n): n is string => typeof n === "string" && !!n.trim());
        if (names.length > 0) {
          try {
            trace.start("research-needs");
            const researched = await researchNeeds(names);
            const found = researched.reduce((a, s) => a + s.candidates.length, 0);
            trace.end("research-needs", `Researched ${names.length} connector need${names.length === 1 ? "" : "s"} at approval`, [
              `repos:${found}`,
            ]);
            rawSolutions = researched as unknown[];
            (config as Record<string, unknown>).external_solutions = rawSolutions;
          } catch (researchErr) {
            trace.fail("research-needs", "Approval-time research failed", researchErr instanceof Error ? researchErr.message : String(researchErr));
          }
        } else {
          trace.skip("research-needs", "No external needs to research");
        }
      }
      const solutions = rawSolutions
        .filter((s): s is Record<string, unknown> => !!s && typeof s === "object" && typeof (s as Record<string, unknown>).need === "string")
        .slice(0, 5)
        .map((s) => ({
          need: s.need as string,
          note: typeof s.note === "string" ? (s.note as string).slice(0, 200) : "",
          // Fulfillment advances only in the lane-2 builder loop with
          // evidence — approval never upgrades it, only carries it.
          fulfillment: ["fetched", "evaluated", "integrated"].includes(s.fulfillment as string)
            ? (s.fulfillment as string)
            : "found",
          candidates: (Array.isArray(s.candidates) ? s.candidates : [])
            .filter((c): c is Record<string, unknown> => !!c && typeof c === "object" && typeof (c as Record<string, unknown>).name === "string" && typeof (c as Record<string, unknown>).url === "string")
            .slice(0, 3)
            .map((c) => ({
              name: c.name as string,
              url: c.url as string,
              stars: typeof c.stars === "number" ? c.stars : 0,
              license: typeof c.license === "string" ? c.license : "unknown",
              open_source: c.open_source === true,
            })),
        }));
      capabilities.ui_surface = {
        visible_pages: shownKeys,
        widget: {
          booking: bool(wp.booking, bookingOn),
          ordering: bool(wp.ordering, orderingOn),
          voice: bool(wp.voice, true),
          lead_capture: bool(wp.lead_capture, bookingOn || orderingOn),
        },
        solutions,
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
        // Derive the widget's catalog mode from capabilities (previously
        // only the frontend set this, so API/draft approvals left widgets
        // stuck on the wrong model — e.g. ordering operators showing no
        // product replies at all).
        business_model: bookingOn && orderingOn ? "both" : orderingOn ? "products" : "services",
        // Preserve existing fields that aren't in the config
      })
      .eq("id", receptionist_id);

    if (updateErr) {
      console.error("[approve-operator-plan] Update error:", updateErr);
      trace.fail("apply-config", "Live operator update failed", "database rejected the update");
      return jsonRes({ ok: false, error: "apply_failed", trace: trace.steps(), trace_summary: trace.summary() }, 500);
    }
    trace.end("apply-config", "Plan applied to the live operator", [
      shownKeys.length > 0 || hiddenKeys.length > 0 ? "dashboard surface written" : "no surface change",
    ]);

    // F1: operators with booking get their reminder cron scheduled
    // automatically (setup-reminder-cron was previously never invoked, so
    // reminders silently never ran). Non-fatal — approval must not fail
    // because scheduling did.
    try {
      const workflows = (config.workflows || {}) as Record<string, { enabled?: boolean }>;
      if (workflows.appointment_booking?.enabled === true) {
        trace.start("schedule-cron");
        const baseUrl = Deno.env.get("SUPABASE_URL") || "";
        const svcKey = Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
        if (baseUrl && svcKey) {
          const cronRes = await fetch(`${baseUrl}/functions/v1/setup-reminder-cron`, {
            method: "POST",
            headers: { Authorization: `Bearer ${svcKey}`, "Content-Type": "application/json" },
            body: "{}",
          });
          console.log("[approve-operator-plan] Reminder cron setup:", cronRes.status);
          trace.end("schedule-cron", "Reminder schedule armed", [`setup:${cronRes.status}`]);
        } else {
          trace.skip("schedule-cron", "Reminder schedule skipped", ["no runtime URL available"]);
        }
      } else {
        trace.skip("schedule-cron", "No booking workflow — no reminders needed");
      }
    } catch (cronErr) {
      trace.fail("schedule-cron", "Reminder schedule failed (approval unaffected)", String(cronErr).slice(0, 150));
      console.warn("[approve-operator-plan] Reminder cron setup failed (non-fatal):", String(cronErr).slice(0, 150));
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
      trace: trace.steps(),
      trace_summary: trace.summary(),
    });
  } catch (e) {
    console.error("[approve-operator-plan] Error:", e);
    return jsonRes({ ok: false, error: "internal_error", trace: trace.steps(), trace_summary: trace.summary() }, 500);
  }
});
