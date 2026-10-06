import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateOperatorPlan, generateChangePlan } from "../_shared/config/enhancedConfigurator.ts";
import { getLatestVersion, getReasoningHistory, saveConfigVersion } from "../_shared/config/versioning.ts";
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

// Gateway now allows 300s turns; the worker is never waited on, so it can
// use nearly all of that. Stays under with margin for research + save.
const WORKER_ASK_TIMEOUT_MS = 270_000;
const MAX_ATTEMPTS = 3;

interface PlanJob {
  id: string;
  receptionist_id: string;
  user_id: string;
  kind: "operator" | "change";
  input_json: Record<string, unknown>;
  attempts: number;
}

/**
 * plan-worker (fallback C) — background planning with no client waiting.
 *
 * pg_cron sweeps this every minute. Each tick claims ONE queued job
 * (single-statement claim: concurrent ticks block on the row lock, then
 * re-check status — only one tick ever wins a job), runs the full pipeline
 * with long timeouts, and marks it done (result) or failed (error + trace).
 * Safe to invoke directly; unclaimed ticks exit quietly.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    (Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""),
  );

  // Reap stale runs: a worker killed mid-flight (150s wall, box death,
  // deploy restart) leaves running rows no one finishes. Reset them to
  // queued while attempts remain, so the next sweep retries honestly.
  // Rows at max attempts are rescued ONCE MORE only if young (created
  // < 2h ago) — attempts reset to MAX-1 so the cap still bites on truly
  // permanent failures instead of retrying forever.
  try {
    await supabase
      .from("plan_jobs")
      .update({ status: "queued", started_at: null })
      .eq("status", "running")
      .lt("started_at", new Date(Date.now() - 15 * 60 * 1000).toISOString())
      .lt("attempts", MAX_ATTEMPTS);
    await supabase
      .from("plan_jobs")
      .update({ status: "queued", started_at: null, attempts: MAX_ATTEMPTS - 1 })
      .eq("status", "running")
      .gte("attempts", MAX_ATTEMPTS)
      .lt("started_at", new Date(Date.now() - 15 * 60 * 1000).toISOString())
      .gt("created_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());
  } catch {
    // Reaper is best-effort; the claim below is the real path.
  }

  // Atomic claim: update + subselect in one statement. A concurrent tick
  // blocks on the row lock, then re-evaluates status='queued' against the
  // winner's commit and matches zero rows. Exactly one worker wins.
  // Lane 'fast': takes 'any' jobs for the wall-clock-constrained path.
  const { data: claimed, error: claimErr } = await supabase.rpc("claim_plan_job", { p_lane: "fast" });
  if (claimErr) {
    // No claim RPC? Fall back to a plain pick (single-worker setups).
    console.warn("[plan-worker] claim RPC missing, single pick:", claimErr.message);
  }

  let job: PlanJob | null = null;
  if (claimed && (claimed as unknown[]).length > 0) {
    job = (claimed as unknown as PlanJob[])[0];
  } else {
    const { data: rows } = await supabase
      .from("plan_jobs")
      .select("id, receptionist_id, user_id, kind, input_json, attempts")
      .eq("status", "queued")
      .in("lane", ["any", "fast"])
      .lt("attempts", MAX_ATTEMPTS)
      .order("created_at", { ascending: true })
      .limit(1);
    const first = (rows as unknown as PlanJob[] | null)?.[0];
    if (!first) return jsonRes({ ok: true, claimed: false });
    const { data: updated } = await supabase
      .from("plan_jobs")
      .update({ status: "running", started_at: new Date().toISOString(), attempts: first.attempts + 1, lane: "fast" })
      .eq("id", first.id)
      .eq("status", "queued")
      .select("id, receptionist_id, user_id, kind, input_json, attempts");
    const won = (updated as unknown as PlanJob[] | null)?.[0];
    if (!won) return jsonRes({ ok: true, claimed: false });
    job = won;
  }

  const trace = new TraceCollector();
  const finish = async (patch: Record<string, unknown>) => {
    await supabase.from("plan_jobs").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", (job as PlanJob).id);
  };

  // Background execution: respond to the sweeper IMMEDIATELY (Supabase
  // kills response-less functions at the 150s wall), then keep working
  // under EdgeRuntime.waitUntil. The job row — not the HTTP response —
  // carries the outcome, and the reaper above recovers kills.
  const runJob = async () => {
    try {
    const j = job as PlanJob;
    let config: Record<string, unknown>;
    let planText = "";
    let reasoning = "";
    let versionId = "";
    let versionNumber = 0;

    if (j.kind === "operator") {
      const description = typeof j.input_json.description === "string" ? j.input_json.description : "";
      if (!description.trim()) throw new Error("empty_description");
      const result = await generateOperatorPlan(description.trim(), trace, WORKER_ASK_TIMEOUT_MS, j.input_json.nofiles === true);
      config = result.config;
      planText = result.plan.full_text;
      reasoning = result.reasoning_notes;
    } else {
      const changeRequest = typeof j.input_json.change_request === "string" ? j.input_json.change_request : "";
      if (!changeRequest.trim()) throw new Error("empty_change_request");
      const latest = await getLatestVersion(supabase, j.receptionist_id);
      if (!latest) throw new Error("no_existing_config");
      let history: Awaited<ReturnType<typeof getReasoningHistory>> = [];
      try {
        history = await getReasoningHistory(supabase, j.receptionist_id, 8);
      } catch {
        history = [];
      }
      const result = await generateChangePlan(latest.config_json, changeRequest.trim(), history, trace, WORKER_ASK_TIMEOUT_MS, j.input_json.nofiles === true);
      config = result.config;
      planText = result.plan.full_text;
      reasoning = result.reasoning_notes;
    }

    // Full research — the worker has time the live path doesn't.
    try {
      const needs = (config.external_needs || []) as unknown[];
      const names = needs.filter((n): n is string => typeof n === "string" && !!n.trim());
      if (names.length > 0) {
        trace.start("research-needs");
        const solutions = await researchNeeds(names);
        trace.end("research-needs", `Researched ${names.length} connector needs`, [`repos:${solutions.reduce((a, s) => a + s.candidates.length, 0)}`]);
        config.external_solutions = solutions;
      } else {
        trace.skip("research-needs", "No external needs to research");
      }
    } catch (researchErr) {
      trace.fail("research-needs", "Solution research failed", researchErr instanceof Error ? researchErr.message : String(researchErr));
    }

    trace.start("save-draft");
    const version = await saveConfigVersion(supabase, {
      receptionist_id: j.receptionist_id,
      config_json: config,
      plan_text: planText,
      change_source: j.kind === "operator" ? "onboarding" : "owner_change",
      owner_input: (j.kind === "operator" ? j.input_json.description : j.input_json.change_request) as string,
      reasoning_notes: reasoning || undefined,
    });
    versionId = version.id;
    versionNumber = version.version_number;
    trace.end("save-draft", "Draft saved for review (nothing live)", [`version:${versionNumber}`]);

    await finish({
      status: "done",
      result_json: { config, plan_text: planText, reasoning, version_id: versionId, version_number: versionNumber },
      trace_json: trace.steps(),
    });
    console.log(`[plan-worker] Job ${j.id} done:`, trace.summary());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[plan-worker] Job failed:", msg);
    trace.fail("worker", "Background planning failed", msg);
    const attempts = ((job as PlanJob).attempts || 1) + 0;
    // Escalation ladder: fast-lane failures with attempts left hand OFF
    // to the long lane (no time wall) instead of retrying the same
    // constrained path. Terminal only at max attempts.
    const escalate = attempts < MAX_ATTEMPTS;
    await finish({
      status: escalate ? "queued" : "failed",
      lane: escalate ? "long" : undefined,
      error_text: msg.slice(0, 500),
      trace_json: trace.steps(),
      ...(escalate ? { started_at: null } : {}),
    });
  }
  };

  const runtime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil(p: Promise<unknown>): void };
  }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(runJob());
  } else {
    // No background primitive (local dev): run inline and report.
    await runJob();
  }
  return jsonRes({ ok: true, claimed: true, job_id: (job as PlanJob).id });
});
