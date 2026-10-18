/**
 * worker-runner — first deliberately narrow execution adapter.
 *
 * Supports draft-only tasks using direct Gemini generateContent with no tool
 * declarations. It cannot research the web, read internal systems, or perform
 * external side effects. Broader capabilities require separate verified adapters.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseWorkerDefinition } from "../_shared/workerContract.ts";
import { canEditWorker } from "../_shared/workerAccess.ts";
import { checkRateLimit, RATE_LIMITS } from "../_shared/rateLimiter.ts";
import { buildDraftPrompt, parseDraftModelOutput, validateDraftTaskInput } from "../_shared/workerDraftExecution.ts";

type JsonRecord = Record<string, unknown>;
type ServiceClient = any;

interface ClaimedTask {
  id: string;
  worker_id: string;
  goal: string;
  input_json: JsonRecord;
  lease_token: string;
  worker_version: number;
  execution_attempt_id: string;
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function finishTask(
  service: ServiceClient,
  task: ClaimedTask,
  outcome: "done" | "blocked" | "failed" | "cancelled",
  output: JsonRecord | null,
  evidence: JsonRecord[] | null,
  error: string | null,
): Promise<JsonRecord> {
  const { data, error: rpcError } = await service.rpc("finish_ai_worker_task", {
    p_task_id: task.id,
    p_lease_token: task.lease_token,
    p_outcome: outcome,
    p_output: output,
    p_evidence: evidence,
    p_error: error,
  });
  if (rpcError) throw new Error("task_finish_rpc_failed");
  const result = asRecord(data);
  if (!result || result.ok !== true) {
    const reason = result && typeof result.error === "string" ? result.error : "task_finish_rejected";
    throw new Error(reason);
  }
  return result;
}

async function callGemini(prompt: string, apiKey: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 65_000);
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: [
                "You are a text-only drafting engine inside a restricted worker runtime.",
                "You have no tools, no web access, no database access, and no ability to perform external actions.",
                "Never claim that an external action occurred.",
                "Do not invent facts or credentials. Use explicit placeholders for missing details.",
                "Return only JSON that follows the requested schema.",
              ].join(" "),
            }],
          },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 3000,
            responseMimeType: "application/json",
          },
        }),
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new Error(`model_http_${response.status}`);
    const data = asRecord(await response.json());
    const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
    const candidate = asRecord(candidates[0]);
    const content = asRecord(candidate?.content);
    const parts = Array.isArray(content?.parts) ? content.parts : [];
    const first = asRecord(parts[0]);
    if (typeof first?.text !== "string" || !first.text.trim()) throw new Error("empty_model_output");
    return first.text;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("model_timeout");
    if (error instanceof Error && /^(model_http_|empty_model_output)/.test(error.message)) throw error;
    throw new Error("model_request_failed");
  } finally {
    clearTimeout(timer);
  }
}

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonRes({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return jsonRes({ ok: false, error: "missing_authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const geminiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_API_KEY") || Deno.env.get("AI_API_KEY") || "";
    if (!supabaseUrl || !serviceKey || !geminiKey) {
      return jsonRes({ ok: false, error: "runner_dependencies_not_configured" }, 503);
    }

    const service: ServiceClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: authError } = await service.auth.getUser(token);
    if (authError || !user) return jsonRes({ ok: false, error: "invalid_token" }, 401);

    const rate = checkRateLimit(`worker-runner:${user.id}`, RATE_LIMITS.workerRegistry);
    if (!rate.allowed) {
      const retry = Math.max(1, Math.ceil((rate.retryAfterMs ?? 60_000) / 1000));
      return jsonRes({ ok: false, error: "rate_limited", retry_after_seconds: retry }, 429);
    }

    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > 4096) {
      return jsonRes({ ok: false, error: "request_too_large" }, 413);
    }
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonRes({ ok: false, error: "invalid_json" }, 400);
    }
    const record = asRecord(body);
    if (!record || Object.keys(record).some((key) => !["worker_id", "task_id"].includes(key)) || !isUuid(record.worker_id)) {
      return jsonRes({ ok: false, error: "invalid_worker_id" }, 400);
    }
    if (record.task_id !== undefined && !isUuid(record.task_id)) {
      return jsonRes({ ok: false, error: "invalid_task_id" }, 400);
    }

    const { data: workerData, error: workerLookupError } = await service
      .from("ai_workers")
      .select("id, organization_id, created_by, status, version, definition")
      .eq("id", record.worker_id)
      .maybeSingle();
    if (workerLookupError) return jsonRes({ ok: false, error: "worker_lookup_failed" }, 500);
    if (!workerData) return jsonRes({ ok: false, error: "worker_not_found" }, 404);
    if (workerData.status !== "active") return jsonRes({ ok: false, error: "worker_not_active" }, 409);

    let membership: { role: string; joined_at: string | null } | null = null;
    if (workerData.organization_id) {
      const { data, error } = await service.from("organization_members")
        .select("role, joined_at")
        .eq("organization_id", workerData.organization_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) return jsonRes({ ok: false, error: "membership_lookup_failed" }, 500);
      membership = data;
    }
    if (!canEditWorker(user.id, workerData, membership?.joined_at ? { role: membership.role } : null)) {
      return jsonRes({ ok: false, error: "worker_access_denied" }, 403);
    }

    const claimArgs = record.task_id
      ? { p_worker_id: record.worker_id, p_task_id: record.task_id, p_lease_seconds: 120 }
      : { p_worker_id: record.worker_id, p_lease_seconds: 120 };
    const claimFunction = record.task_id ? "claim_ai_worker_task_for_task" : "claim_ai_worker_task";
    const { data: claimData, error: claimError } = await service.rpc(claimFunction, claimArgs);
    const { data: claimData, error: claimError } = await service.rpc("claim_ai_worker_task", {
      p_worker_id: record.worker_id,
      p_lease_seconds: 120,
    });
    if (claimError) return jsonRes({ ok: false, error: "task_claim_failed" }, 500);
    const claim = asRecord(claimData);
    if (!claim || claim.ok !== true) {
      const reason = claim && typeof claim.error === "string" ? claim.error : "task_claim_rejected";
      return jsonRes({ ok: false, error: reason }, reason === "worker_not_active" ? 409 : 500);
    }
    if (claim.empty === true || claim.task === null) return jsonRes({ ok: true, empty: true }, 200);

    const task = asRecord(claim.task) as unknown as ClaimedTask | null;
    if (!task || !isUuid(task.id) || !isUuid(task.worker_id) || !isUuid(task.lease_token) ||
        typeof task.goal !== "string" || !asRecord(task.input_json) ||
        typeof task.worker_version !== "number" || !isUuid(task.execution_attempt_id)) {
      return jsonRes({ ok: false, error: "claimed_task_shape_invalid" }, 500);
    }

    const block = async (reason: string) => {
      await finishTask(service, task, "blocked", null, null, reason.slice(0, 1000));
      return jsonRes({ ok: true, task_id: task.id, status: "blocked", reason }, 200);
    };

    const { data: workerData, error: workerError } = await service
      .from("ai_workers")
      .select("id, status, version, definition")
      .eq("id", task.worker_id)
      .maybeSingle();
    if (workerError || !workerData) return await block("worker_definition_unavailable");
    if (workerData.status !== "active") return await block("worker_paused_or_archived");
    if (workerData.version !== task.worker_version) return await block("worker_version_changed_after_claim");

    const parsedDefinition = parseWorkerDefinition(workerData.definition);
    if (!parsedDefinition.ok) return await block("worker_definition_invalid");
    const definition = parsedDefinition.value;
    const validation = validateDraftTaskInput(definition, { goal: task.goal, input_json: task.input_json });
    if (!validation.ok) return await block(validation.error);

    const prompt = buildDraftPrompt(definition, { goal: task.goal, input_json: task.input_json }, validation.payload);
    let modelText: string;
    try {
      modelText = await callGemini(prompt, geminiKey);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "model_request_failed";
      await finishTask(service, task, "failed", null, null, reason.slice(0, 1000));
      return jsonRes({ ok: false, task_id: task.id, status: "failed", error: reason }, 502);
    }

    const heartbeat = await service.rpc("heartbeat_ai_worker_task", {
      p_task_id: task.id,
      p_lease_token: task.lease_token,
      p_lease_seconds: 120,
    });
    const heartbeatResult = asRecord(heartbeat.data);
    if (heartbeat.error || !heartbeatResult || heartbeatResult.ok !== true) {
      if (heartbeatResult?.error === "cancellation_requested") {
        await finishTask(service, task, "cancelled", null, null, null);
        return jsonRes({ ok: true, task_id: task.id, status: "cancelled" }, 200);
      }
      return jsonRes({ ok: false, task_id: task.id, error: "lease_heartbeat_failed" }, 409);
    }

    const output = parseDraftModelOutput(modelText, definition);
    if (!output.ok) {
      await finishTask(service, task, "failed", null, null, output.error);
      return jsonRes({ ok: false, task_id: task.id, status: "failed", error: output.error }, 502);
    }

    const outputJson: JsonRecord = {
      mode: "draft",
      values: output.values,
      notes: output.notes,
      model: "gemini-2.5-flash-lite",
      generated_at: new Date().toISOString(),
    };
    const evidence = [{
      kind: "verification",
      summary: "Draft output passed declared output-field validation, size bounds and credential-pattern checks. No external action was attempted.",
      reference: `worker-runner:${task.id}:attempt:${task.execution_attempt_id}:draft-schema-v1`,
    }];
    const finished = await finishTask(service, task, "done", outputJson, evidence, null);
    const finishedTask = asRecord(finished.task);
    return jsonRes({
      ok: true,
      task_id: task.id,
      status: finishedTask?.status || "done",
      output: outputJson,
    }, 200);
  } catch (error) {
    console.error("[worker-runner] request failed", error instanceof Error ? error.message : "unknown");
    return jsonRes({ ok: false, error: "internal_error" }, 500);
  }
});
