import { supabase } from "@/integrations/supabase/client";
import { validateOperationsConfig, type OperationsConfig } from "./operationsConfig";

/**
 * Frontend seam to the Business Configuration Agent (Phase 1).
 *
 * Per FRONTDESK-INTEGRATION-GUIDE.md §7.3: gateway URL/keys NEVER enter
 * browser code. This module only invokes the `onboard-configurator` Supabase
 * Edge Function, which is the sole server-side caller of the gateway.
 *
 * Defense in depth: the edge function validates against its canonical schema;
 * we re-validate here before anything touches local state.
 */

export type DraftResult =
  | { ok: true; config: OperationsConfig }
  | { ok: false; error: string; issues?: string[] };

/** Pure reducer over an edge-function payload — unit-testable without network. */
export function handleEdgePayload(raw: unknown): DraftResult {
  const payload = raw as { ok?: boolean; error?: string; issues?: string[]; config?: unknown } | null;
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "malformed_response" };
  }
  if (payload.ok !== true) {
    return { ok: false, error: payload.error ?? "unknown_error", issues: payload.issues };
  }
  const validated = validateOperationsConfig(payload.config);
  if (!validated.ok) {
    return { ok: false, error: "client_validation_failed", issues: validated.issues };
  }
  return { ok: true, config: validated.data };
}

/** The ONLY function UI code should call. */
export async function draftOperationsConfig(description: string): Promise<DraftResult> {
  if (!description.trim()) return { ok: false, error: "empty_description" };

  const { data, error } = await supabase.functions.invoke("onboard-configurator", {
    body: { description },
  });
  if (error) {
    return { ok: false, error: error.message || "invoke_failed" };
  }
  return handleEdgePayload(data);
}
