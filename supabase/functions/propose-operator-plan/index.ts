import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateOperatorPlan } from "../_shared/config/enhancedConfigurator.ts";
import { saveConfigVersion } from "../_shared/config/versioning.ts";
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
 * propose-operator-plan — Vision Part One
 *
 * Takes a business description, produces:
 * 1. A plain-language plan the owner can read
 * 2. The OperationsConfig that plan compiles into
 * 3. A draft config version (not yet applied)
 *
 * Nothing goes live until the owner calls approve-operator-plan.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { description, receptionist_id, user_id } = body;

    if (!description || typeof description !== "string" || !description.trim()) {
      return jsonRes({ ok: false, error: "missing_description" }, 400);
    }
    if (!receptionist_id || !user_id) {
      return jsonRes({ ok: false, error: "missing_receptionist_id_or_user_id" }, 400);
    }

    // Generate the plan and config from the business description
    const result = await generateOperatorPlan(description.trim());

    // Save as a draft config version (not yet approved)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""),
    );

    const version = await saveConfigVersion(supabase, {
      receptionist_id,
      config_json: result.config,
      plan_text: result.plan.full_text,
      change_source: "onboarding",
      owner_input: description.trim(),
      reasoning_notes: result.reasoning_notes || undefined,
    });

    return jsonRes({
      ok: true,
      plan: result.plan,
      config: result.config,
      reasoning_notes: result.reasoning_notes,
      version_id: version.id,
      version_number: version.version_number,
    });
  } catch (e) {
    console.error("[propose-operator-plan] Error:", e);
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
