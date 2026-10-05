/**
 * Long-lane planning worker (local/VPS box).
 *
 * Same shared pipeline as the edge plan-worker, different constraint
 * profile: no 150s wall, gateway reached directly (localhost or LAN —
 * whatever RUTEX_GATEWAY_URL says). Claims ONLY lane='long' jobs that the
 * fast lane escalated. Atomic claim via claim_plan_job('long').
 *
 * EVERYTHING comes from the environment — no URLs, keys, intervals, or
 * timeouts are written here, so moving boxes (local -> VPS) means changing
 * env, never code:
 *   SUPABASE_URL             e.g. https://<ref>.supabase.co
 *   RUTEX_SERVICE_ROLE_KEY   service role (box-only .env, never commit)
 *   RUTEX_GATEWAY_URL        e.g. http://127.0.0.1:8787 (no tunnel needed)
 *   RUTEX_GATEWAY_KEY        frontdesk project bearer key (box-only .env)
 *   POLL_SECONDS             default 30
 *   ASK_TIMEOUT_MS             default 280000 (gateway must allow it)
 *
 * Run:  deno run --allow-env --allow-net scripts/plan-worker-local.ts
 * Keep alive with PM2 / systemd / Task Scheduler on the host.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateOperatorPlan, generateChangePlan } from "../supabase/functions/_shared/config/enhancedConfigurator.ts";
import { getLatestVersion, getReasoningHistory, saveConfigVersion } from "../supabase/functions/_shared/config/versioning.ts";
import { researchNeeds } from "../supabase/functions/_shared/config/solutionResearch.ts";
import { TraceCollector } from "../supabase/functions/_shared/config/trace.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || "";
const POLL_MS = Number(Deno.env.get("POLL_SECONDS") || "30") * 1000;
const ASK_TIMEOUT_MS = Number(Deno.env.get("ASK_TIMEOUT_MS") || "280000");
const MAX_ATTEMPTS = 3;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("[long-worker] Missing SUPABASE_URL or RUTEX_SERVICE_ROLE_KEY — refusing to start.");
  Deno.exit(1);
}
// rutexMcp reads RUTEX_GATEWAY_URL / RUTEX_GATEWAY_KEY from env at import;
// fail fast here with a clear message instead of cryptic fetch errors.
if (!Deno.env.get("RUTEX_GATEWAY_URL") || !Deno.env.get("RUTEX_GATEWAY_KEY")) {
  console.error("[long-worker] Missing RUTEX_GATEWAY_URL or RUTEX_GATEWAY_KEY — refusing to start.");
  Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

interface Job {
  id: string;
  receptionist_id: string;
  user_id: string;
  kind: "operator" | "change";
  input_json: Record<string, unknown>;
  attempts: number;
}

async function tick(): Promise<void> {
  const { data: claimed, error } = await supabase.rpc("claim_plan_job", { p_lane: "long" });
  if (error) {
    console.warn("[long-worker] claim failed:", error.message);
    return;
  }
  const job = ((claimed as unknown as Job[] | null) || [])[0];
  if (!job) return; // Nothing escalated — quiet tick.

  console.log(`[long-worker] Claimed ${job.id} (${job.kind}, attempt ${job.attempts})`);
  const trace = new TraceCollector();
  const finish = async (patch: Record<string, unknown>) => {
    await supabase.from("plan_jobs")
      .update({ ...patch, finished_at: new Date().toISOString() })
      .eq("id", job.id);
  };

  try {
    let config: Record<string, unknown>;
    let planText = "";
    let reasoning = "";
    let versionId = "";
    let versionNumber = 0;

    if (job.kind === "operator") {
      const description = typeof job.input_json.description === "string" ? job.input_json.description : "";
      if (!description.trim()) throw new Error("empty_description");
      const result = await generateOperatorPlan(description.trim(), trace, ASK_TIMEOUT_MS);
      config = result.config;
      planText = result.plan.full_text;
      reasoning = result.reasoning_notes;
    } else {
      const changeRequest = typeof job.input_json.change_request === "string" ? job.input_json.change_request : "";
      if (!changeRequest.trim()) throw new Error("empty_change_request");
      const latest = await getLatestVersion(supabase, job.receptionist_id);
      if (!latest) throw new Error("no_existing_config");
      let history: Awaited<ReturnType<typeof getReasoningHistory>> = [];
      try {
        history = await getReasoningHistory(supabase, job.receptionist_id, 8);
      } catch {
        history = [];
      }
      const result = await generateChangePlan(latest.config_json, changeRequest.trim(), history, trace, ASK_TIMEOUT_MS);
      config = result.config;
      planText = result.plan.full_text;
      reasoning = result.reasoning_notes;
    }

    try {
      const needs = (config.external_needs || []) as unknown[];
      const names = needs.filter((n): n is string => typeof n === "string" && !!n.trim());
      if (names.length > 0) {
        trace.start("research-needs");
        const solutions = await researchNeeds(names);
        trace.end("research-needs", `Researched ${names.length} needs`, [`repos:${solutions.reduce((a, s) => a + s.candidates.length, 0)}`]);
        config.external_solutions = solutions;
      } else {
        trace.skip("research-needs", "No external needs");
      }
    } catch (e) {
      trace.fail("research-needs", "Research failed", e instanceof Error ? e.message : String(e));
    }

    trace.start("save-draft");
    const version = await saveConfigVersion(supabase, {
      receptionist_id: job.receptionist_id,
      config_json: config,
      plan_text: planText,
      change_source: job.kind === "operator" ? "onboarding" : "owner_change",
      owner_input: (job.kind === "operator" ? job.input_json.description : job.input_json.change_request) as string,
      reasoning_notes: reasoning || undefined,
    });
    versionId = version.id;
    versionNumber = version.version_number;
    trace.end("save-draft", "Draft saved (nothing live)", [`version:${versionNumber}`]);

    await finish({
      status: "done",
      result_json: { config, plan_text: planText, reasoning, version_id: versionId, version_number: versionNumber },
      trace_json: trace.steps(),
    });
    console.log(`[long-worker] Done ${job.id}:`, trace.summary());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[long-worker] Failed ${job.id}:`, msg);
    trace.fail("worker", "Long-lane planning failed", msg);
    const terminal = (job.attempts || 1) >= MAX_ATTEMPTS;
    await finish({
      status: terminal ? "failed" : "queued",
      error_text: msg.slice(0, 500),
      trace_json: trace.steps(),
      ...(terminal ? {} : { started_at: null }),
    });
  }
}

console.log("[long-worker] Long lane watching (same pipeline, no time wall).");
for (;;) {
  try {
    await tick();
  } catch (e) {
    console.warn("[long-worker] Tick error:", e instanceof Error ? e.message : String(e));
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}
