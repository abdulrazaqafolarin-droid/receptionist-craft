import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateOperatorPlan } from "../_shared/config/enhancedConfigurator.ts";
import { saveConfigVersion } from "../_shared/config/versioning.ts";
import { researchNeeds } from "../_shared/config/solutionResearch.ts";
import { TraceCollector } from "../_shared/config/trace.ts";
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

/** Serialize any thrown value (Error, PostgREST object, string) for diagnostics. */
function errDetails(e: unknown, max = 300): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`.slice(0, max);
  try {
    return JSON.stringify(e).slice(0, max);
  } catch {
    return String(e).slice(0, max);
  }
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

  // Collector lives outside try so the trace survives failure — the
  // Playground shows how far planning got even on error paths.
  const trace = new TraceCollector();
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
    const result = await generateOperatorPlan(description.trim(), trace);

    // Stage 4: research each external need (open-source first). Failures
    // degrade to empty candidates — research never blocks planning.
    try {
      const needs = (result.config.external_needs || []) as unknown[];
      const names = needs.filter((n): n is string => typeof n === "string" && !!n.trim());
      if (names.length > 0) {
        trace.start("research-needs");
        const solutions = await researchNeeds(names);
        const found = solutions.reduce((a, s) => a + s.candidates.length, 0);
        const oss = solutions.reduce((a, s) => a + s.candidates.filter((c) => c.open_source).length, 0);
        trace.end("research-needs", `Researched ${names.length} connector need${names.length === 1 ? "" : "s"}`, [
          `repos:${found} found`,
          `${oss} open-source`,
        ]);
        result.config.external_solutions = solutions;
      } else {
        trace.skip("research-needs", "No external needs to research");
      }
    } catch (researchErr) {
      trace.fail("research-needs", "Solution research failed", researchErr instanceof Error ? researchErr.message : String(researchErr));
      console.warn("[propose-operator-plan] Solution research failed (non-fatal):", researchErr);
    }

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
    trace.end("save-draft", "Draft saved for review (nothing live)", [`version:${version.version_number}`]);

    return jsonRes({
      ok: true,
      plan: result.plan,
      config: result.config,
      reasoning_notes: result.reasoning_notes,
      version_id: version.id,
      version_number: version.version_number,
      trace: trace.steps(),
      trace_summary: trace.summary(),
    });
  } catch (e) {
    console.error("[propose-operator-plan] Error:", e);
    // The trace survives failure: the Playground shows how far planning got.
    const traceOut = trace.steps();
    const traceSummary = trace.summary();
    if (e instanceof RutexMcpError) {
      const map: Record<string, string> = {
        not_configured: "gateway_not_configured",
        auth: "gateway_auth_failed",
        timeout: "gateway_timeout",
        unreachable: "gateway_unreachable",
        tool_error: "gateway_empty_response",
        protocol: "gateway_protocol_error",
      };
      return jsonRes({ ok: false, error: map[e.kind] ?? "gateway_unreachable", details: String(e).slice(0, 200), trace: traceOut, trace_summary: traceSummary }, 502);
    }
    return jsonRes({ ok: false, error: "internal_error", details: errDetails(e), trace: traceOut, trace_summary: traceSummary }, 500);
  }
});
