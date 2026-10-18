/**
 * worker-tasks — authenticated durable task queue API.
 *
 * This endpoint records work and enforces task lifecycle boundaries. It does
 * not execute arbitrary code, call shell commands, or claim that a task ran.
 * A separate trusted runner must claim and execute queued work in a later slice.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { canEditWorker, canReadWorker } from "../_shared/workerAccess.ts";
import { parseWorkerDefinition } from "../_shared/workerContract.ts";
import { isBoundedApprovalId, parseWorkerTaskCreateRequest } from "../_shared/workerTaskRequest.ts";
import { validateDraftTaskInput } from "../_shared/workerDraftExecution.ts";
import { RATE_LIMITS } from "../_shared/rateLimiter.ts";
import { consumePersistentRateLimit } from "../_shared/persistentRateLimit.ts";

type JsonRecord = Record<string, unknown>;
type ServiceClient = any;

interface WorkerRow {
  id: string;
  organization_id: string | null;
  created_by: string;
  status: string;
  version: number;
  definition: unknown;
}

interface TaskRow {
  id: string;
  worker_id: string;
  created_by: string;
  title: string;
  goal: string;
  status: string;
  input_json: JsonRecord;
  output_json: unknown;
  error_text: string | null;
  attempt_count: number;
  checkpoint_json: JsonRecord;
  approval_request: JsonRecord | null;
  approved_by: string | null;
  approved_at: string | null;
  cancel_requested_at: string | null;
  created_at: string;
  updated_at: string;
}

function corsFor(req: Request): Record<string, string> | null {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = Deno.env.get("RUTEX_APP_ORIGIN") || "https://receptionist-craft.vercel.app";
  if (origin && origin !== allowedOrigin && !origin.startsWith("http://localhost:")) return null;
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonRes(body: unknown, status = 200, cors: Record<string, string> = {}, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, ...extra, "Content-Type": "application/json" },
  });
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

async function getMembership(service: ServiceClient, organizationId: string, userId: string): Promise<{ role: string } | null> {
  const { data, error } = await service
    .from("organization_members")
    .select("role, joined_at")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("membership_lookup_failed");
  if (!data || !data.joined_at) return null;
  return { role: String(data.role) };
}

async function getWorker(service: ServiceClient, workerId: string): Promise<WorkerRow | null> {
  const { data, error } = await service
    .from("ai_workers")
    .select("id, organization_id, created_by, status, version, definition")
    .eq("id", workerId)
    .maybeSingle();
  if (error) throw new Error("worker_lookup_failed");
  return data as WorkerRow | null;
}

async function getTask(service: ServiceClient, taskId: string): Promise<TaskRow | null> {
  const { data, error } = await service.from("ai_worker_tasks").select(
    "id, worker_id, created_by, title, goal, status, input_json, output_json, error_text, attempt_count, checkpoint_json, idempotency_key, approval_request, approved_by, approved_at, cancel_requested_at, started_at, finished_at, created_at, updated_at",
  ).eq("id", taskId).maybeSingle();
  if (error) throw new Error("task_lookup_failed");
  return data as TaskRow | null;
}

async function authorizeWorker(service: ServiceClient, actorId: string, worker: WorkerRow, edit: boolean): Promise<boolean> {
  const membership = worker.organization_id
    ? await getMembership(service, worker.organization_id, actorId)
    : null;
  return edit
    ? canEditWorker(actorId, worker, membership)
    : canReadWorker(actorId, worker, membership);
}

function errorStatus(error: string): number {
  if (error === "worker_not_found" || error === "task_not_found") return 404;
  if (error === "worker_access_denied" || error === "task_access_denied") return 403;
  if (error === "worker_not_active" || error === "worker_definition_invalid" ||
      error === "approval_not_pending" || error === "approval_request_mismatch" ||
      error === "idempotency_key_reused" || error === "task_terminal" ||
      error === "worker_not_verified" || error === "task_not_queued") return 409;
  if (error === "invalid_task_input") return 400;
  return 500;
}

Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  if (!cors) return new Response("forbidden origin", { status: 403 });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return jsonRes({ ok: false, error: "method_not_allowed" }, 405, cors);

  try {
    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return jsonRes({ ok: false, error: "missing_authorization" }, 401, cors);

    const url = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !serviceKey) return jsonRes({ ok: false, error: "service_not_configured" }, 500, cors);

    const service: ServiceClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: authError } = await service.auth.getUser(token);
    if (authError || !user) return jsonRes({ ok: false, error: "invalid_token" }, 401, cors);

    const rate = await consumePersistentRateLimit(service, user.id, "worker-tasks", RATE_LIMITS.workerRegistry);
    if (!rate.available) return jsonRes({ ok: false, error: "rate_limiter_unavailable" }, 503, cors);
    if (!rate.allowed) {
      const retry = rate.retryAfterSeconds;
      return jsonRes({ ok: false, error: "rate_limited", retry_after_seconds: retry }, 429, cors, {
        "Retry-After": String(retry),
        "X-RateLimit-Reason": rate.reason || "window",
      });
    }

    const body = asRecord(await req.json().catch(() => ({})));
    if (!body) return jsonRes({ ok: false, error: "invalid_body" }, 400, cors);
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "create") {
      const parsed = parseWorkerTaskCreateRequest(body);
      if (!parsed.ok) return jsonRes({ ok: false, error: parsed.error }, 400, cors);
      const request = parsed.value;
      const worker = await getWorker(service, request.worker_id);
      if (!worker) return jsonRes({ ok: false, error: "worker_not_found" }, 404, cors);
      if (!await authorizeWorker(service, user.id, worker, true)) {
        return jsonRes({ ok: false, error: "worker_access_denied" }, 403, cors);
      }
      if (worker.status !== "active") return jsonRes({ ok: false, error: "worker_not_active" }, 409, cors);
      const parsedDefinition = parseWorkerDefinition(worker.definition);
      if (!parsedDefinition.ok) {
        return jsonRes({ ok: false, error: "worker_definition_invalid" }, 409, cors);
      }
      const draftCheck = validateDraftTaskInput(parsedDefinition.value, {
        goal: request.goal,
        input_json: request.input_json,
      });
      if (!draftCheck.ok) {
        return jsonRes({ ok: false, error: draftCheck.error }, 400, cors);
      }

      const { data, error } = await service.rpc("create_ai_worker_task", {
        p_worker_id: request.worker_id,
        p_actor_id: user.id,
        p_title: request.title,
        p_goal: request.goal,
        p_input: request.input_json,
        p_idempotency_key: request.idempotency_key,
      });
      if (error) return jsonRes({ ok: false, error: "task_create_failed" }, 500, cors);
      const result = asRecord(data);
      if (!result || result.ok !== true) {
        const reason = result && typeof result.error === "string" ? result.error : "task_create_failed";
        return jsonRes({ ok: false, error: reason }, errorStatus(reason), cors);
      }
      const replayed = result.replayed === true;
      return jsonRes({ ok: true, replayed, task: result.task }, replayed ? 200 : 201, cors);
    }

    if (action === "list") {
      if (!isUuid(body.worker_id)) return jsonRes({ ok: false, error: "invalid_worker_id" }, 400, cors);
      const worker = await getWorker(service, body.worker_id);
      if (!worker) return jsonRes({ ok: false, error: "worker_not_found" }, 404, cors);
      if (!await authorizeWorker(service, user.id, worker, false)) {
        return jsonRes({ ok: false, error: "worker_access_denied" }, 403, cors);
      }
      const { data, error } = await service.from("ai_worker_tasks").select(
        "id, worker_id, created_by, title, goal, status, output_json, error_text, attempt_count, checkpoint_json, approval_request, approved_by, approved_at, cancel_requested_at, created_at, updated_at",
      ).eq("worker_id", worker.id).order("created_at", { ascending: false }).limit(100);
      if (error) return jsonRes({ ok: false, error: "task_list_failed" }, 500, cors);
      return jsonRes({ ok: true, tasks: Array.isArray(data) ? data : [] }, 200, cors);
    }

    if (action === "get" || action === "approve" || action === "cancel") {
      if (!isUuid(body.task_id)) return jsonRes({ ok: false, error: "invalid_task_id" }, 400, cors);
      const task = await getTask(service, body.task_id);
      if (!task) return jsonRes({ ok: false, error: "task_not_found" }, 404, cors);
      const worker = await getWorker(service, task.worker_id);
      if (!worker) return jsonRes({ ok: false, error: "worker_not_found" }, 404, cors);
      if (!await authorizeWorker(service, user.id, worker, action !== "get")) {
        return jsonRes({ ok: false, error: "task_access_denied" }, 403, cors);
      }

      if (action === "get") {
        const { data: events, error } = await service.from("ai_worker_task_events")
          .select("id, actor_id, event_type, from_status, to_status, details, created_at")
          .eq("task_id", task.id).order("created_at", { ascending: true }).limit(200);
        if (error) return jsonRes({ ok: false, error: "task_events_lookup_failed" }, 500, cors);
        return jsonRes({ ok: true, task, events: Array.isArray(events) ? events : [] }, 200, cors);
      }

      let approvalId: string | null = null;
      if (action === "approve") {
        if (!isBoundedApprovalId(body.approval_id)) {
          return jsonRes({ ok: false, error: "invalid_approval_id" }, 400, cors);
        }
        approvalId = body.approval_id.trim();
        if (worker.status !== "active") return jsonRes({ ok: false, error: "worker_not_active" }, 409, cors);
      }

      const { data, error } = await service.rpc("transition_ai_worker_task", {
        p_task_id: task.id,
        p_actor_id: user.id,
        p_action: action,
        p_approval_id: approvalId,
      });
      if (error) return jsonRes({ ok: false, error: "task_transition_failed" }, 500, cors);
      const result = asRecord(data);
      if (!result || result.ok !== true) {
        const reason = result && typeof result.error === "string" ? result.error : "task_transition_failed";
        return jsonRes({ ok: false, error: reason }, errorStatus(reason), cors);
      }
      const updatedTask = asRecord(result.task);
      const cancelRequested = action === "cancel" && updatedTask?.status === "running";
      return jsonRes({
        ok: true,
        task: result.task,
        ...(cancelRequested ? { cancel_requested: true } : {}),
      }, 200, cors);
    }

    return jsonRes({ ok: false, error: "unsupported_action" }, 400, cors);
  } catch (error) {
    console.error("[worker-tasks] request failed", error instanceof Error ? error.message : "unknown");
    return jsonRes({ ok: false, error: "internal_error" }, 500, corsFor(req) || {});
  }
});
