/**
 * worker-registry — authenticated lifecycle entry point for general AI Workers.
 *
 * The browser can read workers through RLS, but all writes pass through this
 * function so definition validation and lifecycle rules cannot be bypassed by
 * direct table updates. Publishing/activation is intentionally not implemented
 * until a test-and-verification pipeline exists.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseWorkerDefinition } from "../_shared/workerContract.ts";
import { canArchiveWorker, canCreateOrganizationWorker, canEditWorker, canReadWorker } from "../_shared/workerAccess.ts";

type JsonRecord = Record<string, unknown>;
type ServiceClient = any;

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

function jsonRes(body: unknown, status = 200, cors: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function boundedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= max ? normalized : null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function activeMembership(
  service: ServiceClient,
  organizationId: string,
  userId: string,
): Promise<{ role: string } | null> {
  const { data, error } = await service
    .from("organization_members")
    .select("role, joined_at")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("membership_lookup_failed");
  const membership = data as { role: string; joined_at: string | null } | null;
  if (!membership || !membership.joined_at) return null;
  return { role: String(membership.role) };
}

interface WorkerRow {
  id: string;
  organization_id: string | null;
  created_by: string;
  name: string;
  description: string;
  status: string;
  version: number;
  definition: unknown;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  archived_at: string | null;
}

async function workerForUser(
  service: ServiceClient,
  workerId: string,
): Promise<WorkerRow | null> {
  const { data, error } = await service
    .from("ai_workers")
    .select("id, organization_id, created_by, name, description, status, version, definition, created_at, updated_at, published_at, archived_at")
    .eq("id", workerId)
    .maybeSingle();
  if (error) throw new Error("worker_lookup_failed");
  return data as WorkerRow | null;
}

Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  if (!cors) return new Response("forbidden origin", { status: 403 });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return jsonRes({ ok: false, error: "method_not_allowed" }, 405, cors);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return jsonRes({ ok: false, error: "missing_authorization" }, 401, cors);

    const url = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !serviceKey) return jsonRes({ ok: false, error: "service_not_configured" }, 500, cors);

    const service: ServiceClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: authError } = await service.auth.getUser(token);
    if (authError || !user) return jsonRes({ ok: false, error: "invalid_token" }, 401, cors);

    const body = asRecord(await req.json().catch(() => ({})));
    if (!body) return jsonRes({ ok: false, error: "invalid_body" }, 400, cors);
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "list") {
      const { data: memberships, error: membershipError } = await service
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .not("joined_at", "is", null);
      if (membershipError) return jsonRes({ ok: false, error: "membership_lookup_failed" }, 500, cors);
      const organizationIds = (Array.isArray(memberships) ? memberships : [])
        .map((row: { organization_id?: unknown }) => row.organization_id)
        .filter((id: unknown): id is string => isUuid(id));

      const columns = "id, organization_id, created_by, name, description, status, version, created_at, updated_at, published_at, archived_at";
      const { data: personal, error: personalError } = await service
        .from("ai_workers")
        .select(columns)
        .is("organization_id", null)
        .eq("created_by", user.id)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (personalError) return jsonRes({ ok: false, error: "worker_list_failed" }, 500, cors);

      let organizationWorkers: WorkerRow[] = [];
      if (organizationIds.length > 0) {
        const { data, error } = await service
          .from("ai_workers")
          .select(columns)
          .in("organization_id", organizationIds)
          .order("updated_at", { ascending: false })
          .limit(100);
        if (error) return jsonRes({ ok: false, error: "worker_list_failed" }, 500, cors);
        organizationWorkers = (Array.isArray(data) ? data : []) as WorkerRow[];
      }

      const combined = [...(Array.isArray(personal) ? personal : []), ...organizationWorkers] as WorkerRow[];
      const unique = Array.from(new Map(combined.map((worker) => [worker.id, worker])).values())
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, 100);
      return jsonRes({ ok: true, workers: unique }, 200, cors);
    }

    if (action === "get") {
      if (!isUuid(body.worker_id)) return jsonRes({ ok: false, error: "invalid_worker_id" }, 400, cors);
      const worker = await workerForUser(service, body.worker_id);
      if (!worker) return jsonRes({ ok: false, error: "worker_not_found" }, 404, cors);
      const membership = worker.organization_id
        ? await activeMembership(service, worker.organization_id, user.id)
        : null;
      if (!canReadWorker(user.id, worker, membership)) {
        return jsonRes({ ok: false, error: "worker_access_denied" }, 403, cors);
      }
      return jsonRes({ ok: true, worker }, 200, cors);
    }

    if (action === "create_draft") {
      const name = boundedString(body.name, 120);
      if (!name) return jsonRes({ ok: false, error: "invalid_name" }, 400, cors);
      const description = body.description === undefined ? "" : body.description;
      if (typeof description !== "string" || description.length > 2000) {
        return jsonRes({ ok: false, error: "invalid_description" }, 400, cors);
      }

      let organizationId: string | null = null;
      if (body.organization_id !== undefined && body.organization_id !== null) {
        if (!isUuid(body.organization_id)) {
          return jsonRes({ ok: false, error: "invalid_organization_id" }, 400, cors);
        }
        organizationId = body.organization_id;
        const membership = await activeMembership(service, organizationId, user.id);
        if (!canCreateOrganizationWorker(membership)) {
          return jsonRes({ ok: false, error: "organization_access_denied" }, 403, cors);
        }
      }

      const parsed = parseWorkerDefinition(body.definition);
      if (!parsed.ok) {
        return jsonRes({ ok: false, error: "invalid_worker_definition", details: parsed.errors }, 400, cors);
      }

      const { data, error } = await service.from("ai_workers").insert({
        organization_id: organizationId,
        created_by: user.id,
        name,
        description: description.trim(),
        status: "draft",
        version: 1,
        definition: parsed.value,
      }).select("id, organization_id, created_by, name, description, status, version, definition, created_at, updated_at").single();

      if (error || !data) {
        return jsonRes({ ok: false, error: "worker_create_failed" }, 500, cors);
      }
      return jsonRes({ ok: true, worker: data }, 201, cors);
    }

    if (action === "update_draft") {
      if (!isUuid(body.worker_id)) return jsonRes({ ok: false, error: "invalid_worker_id" }, 400, cors);
      const worker = await workerForUser(service, body.worker_id);
      if (!worker) return jsonRes({ ok: false, error: "worker_not_found" }, 404, cors);
      const editMembership = worker.organization_id
        ? await activeMembership(service, worker.organization_id, user.id)
        : null;
      if (!canEditWorker(user.id, worker, editMembership)) {
        return jsonRes({ ok: false, error: "worker_access_denied" }, 403, cors);
      }
      if (worker.status !== "draft") {
        return jsonRes({ ok: false, error: "only_drafts_can_be_edited", status: worker.status }, 409, cors);
      }

      const parsed = parseWorkerDefinition(body.definition);
      if (!parsed.ok) {
        return jsonRes({ ok: false, error: "invalid_worker_definition", details: parsed.errors }, 400, cors);
      }
      const name = body.name === undefined ? worker.name : boundedString(body.name, 120);
      const description = body.description === undefined ? worker.description : body.description;
      if (!name) return jsonRes({ ok: false, error: "invalid_name" }, 400, cors);
      if (typeof description !== "string" || description.length > 2000) {
        return jsonRes({ ok: false, error: "invalid_description" }, 400, cors);
      }

      const { data, error } = await service.from("ai_workers").update({
        name,
        description: description.trim(),
        definition: parsed.value,
        version: Number(worker.version) + 1,
        updated_at: new Date().toISOString(),
      }).eq("id", worker.id).eq("status", "draft").eq("version", worker.version)
        .select("id, organization_id, created_by, name, description, status, version, definition, created_at, updated_at").maybeSingle();

      if (error) return jsonRes({ ok: false, error: "worker_update_failed" }, 500, cors);
      if (!data) return jsonRes({ ok: false, error: "worker_changed_concurrently" }, 409, cors);
      return jsonRes({ ok: true, worker: data }, 200, cors);
    }

    if (action === "archive") {
      if (!isUuid(body.worker_id)) return jsonRes({ ok: false, error: "invalid_worker_id" }, 400, cors);
      const worker = await workerForUser(service, body.worker_id);
      if (!worker) return jsonRes({ ok: false, error: "worker_not_found" }, 404, cors);
      const archiveMembership = worker.organization_id
        ? await activeMembership(service, worker.organization_id, user.id)
        : null;
      if (!canArchiveWorker(user.id, worker, archiveMembership)) {
        return jsonRes({ ok: false, error: "worker_archive_denied" }, 403, cors);
      }
      const { data, error } = await service.from("ai_workers").update({
        status: "archived",
        archived_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", worker.id).neq("status", "archived")
        .select("id, organization_id, name, status, version, archived_at, updated_at").maybeSingle();

      if (error) return jsonRes({ ok: false, error: "worker_archive_failed" }, 500, cors);
      if (!data) return jsonRes({ ok: false, error: "worker_already_archived" }, 409, cors);
      return jsonRes({ ok: true, worker: data }, 200, cors);
    }

    return jsonRes({ ok: false, error: "unsupported_action" }, 400, cors);
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal_error";
    if (message === "membership_lookup_failed" || message === "worker_lookup_failed") {
      return jsonRes({ ok: false, error: message }, 500, cors);
    }
    return jsonRes({ ok: false, error: "internal_error" }, 500, cors);
  }
});
