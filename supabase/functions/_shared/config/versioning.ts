/**
 * Configuration Versioning
 *
 * Every configuration change gets snapshotted. Enables:
 * - Rollback to any previous version
 * - Audit trail of all changes
 * - Plan-to-config traceability
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface ConfigVersion {
  id: string;
  receptionist_id: string;
  version_number: number;
  config_json: Record<string, unknown>;
  plan_text: string | null;
  change_source: string;
  owner_input: string | null;
  reasoning_notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

/** Minimal shape used to render the Configurator's reasoning-history trail. */
export interface ReasoningHistoryEntry {
  version_number: number;
  change_source: string;
  plan_text: string | null;
  owner_input: string | null;
  reasoning_notes: string | null;
  created_at: string;
}

/**
 * Save a new configuration version. Returns the created version.
 */
export async function saveConfigVersion(
  supabase: SupabaseClient,
  params: {
    receptionist_id: string;
    config_json: Record<string, unknown>;
    plan_text?: string;
    change_source: string;
    owner_input?: string;
    reasoning_notes?: string;
    approved_by?: string;
    approved_at?: string;
  },
): Promise<ConfigVersion> {
  // Get next version number
  const { data: lastVersion } = await supabase
    .from("config_versions")
    .select("version_number")
    .eq("receptionist_id", params.receptionist_id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (lastVersion?.version_number || 0) + 1;

  const { data, error } = await supabase
    .from("config_versions")
    .insert({
      receptionist_id: params.receptionist_id,
      version_number: nextVersion,
      config_json: params.config_json,
      plan_text: params.plan_text || null,
      change_source: params.change_source,
      owner_input: params.owner_input || null,
      reasoning_notes: params.reasoning_notes || null,
      approved_by: params.approved_by || null,
      approved_at: params.approved_at || new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data as ConfigVersion;
}

/**
 * Get the Configurator's reasoning-history trail — the 'why' behind every past
 * plan/change (Step 8 / §4.1b). Newest first. This is what the same Configurator
 * reads back so it can explain WHY a setting is what it is, not just restate it.
 */
export async function getReasoningHistory(
  supabase: SupabaseClient,
  receptionistId: string,
  limit = 8,
): Promise<ReasoningHistoryEntry[]> {
  const { data } = await supabase
    .from("config_versions")
    .select("version_number, change_source, plan_text, owner_input, reasoning_notes, created_at")
    .eq("receptionist_id", receptionistId)
    .order("version_number", { ascending: false })
    .limit(limit);

  return (data as ReasoningHistoryEntry[]) || [];
}

/**
 * Get the latest config version for a receptionist.
 */
export async function getLatestVersion(
  supabase: SupabaseClient,
  receptionistId: string,
): Promise<ConfigVersion | null> {
  const { data } = await supabase
    .from("config_versions")
    .select("*")
    .eq("receptionist_id", receptionistId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as ConfigVersion) || null;
}

/**
 * Get a specific config version by number.
 */
export async function getVersion(
  supabase: SupabaseClient,
  receptionistId: string,
  versionNumber: number,
): Promise<ConfigVersion | null> {
  const { data } = await supabase
    .from("config_versions")
    .select("*")
    .eq("receptionist_id", receptionistId)
    .eq("version_number", versionNumber)
    .maybeSingle();

  return (data as ConfigVersion) || null;
}

/**
 * Get all versions for a receptionist (newest first).
 */
export async function getVersionHistory(
  supabase: SupabaseClient,
  receptionistId: string,
): Promise<ConfigVersion[]> {
  const { data } = await supabase
    .from("config_versions")
    .select("*")
    .eq("receptionist_id", receptionistId)
    .order("version_number", { ascending: false });

  return (data as ConfigVersion[]) || [];
}

/**
 * Revert to a previous version. Actually writes config back to the live
 * receptionist record — this is the real operational rollback, not just
 * a snapshot. Creates a new version documenting the revert.
 */
export async function revertToVersion(
  supabase: SupabaseClient,
  receptionistId: string,
  targetVersionNumber: number,
  revertedBy?: string,
): Promise<ConfigVersion> {
  const target = await getVersion(supabase, receptionistId, targetVersionNumber);
  if (!target) throw new Error(`Version ${targetVersionNumber} not found`);

  const config = target.config_json;

  // Extract config sections
  const business = (config.business || {}) as Record<string, string>;
  const capabilities = (config.capabilities || {}) as Record<string, unknown>;
  const channels = (config.channels || {}) as Record<string, boolean>;
  const customerFields = (config.customer_fields || []) as Array<Record<string, unknown>>;

  // Write back to the LIVE receptionist record
  const updatePayload: Record<string, unknown> = {};

  if (business.display_name) {
    updatePayload.name = business.display_name;
    updatePayload.business_name = business.display_name;
  }
  if (business.business_type) updatePayload.business_type = business.business_type;
  if (business.greeting_message) updatePayload.greeting_message = business.greeting_message;
  if (business.tone) updatePayload.tone = business.tone;
  if (business.industry) updatePayload.industry = business.industry;
  if (business.language) updatePayload.language = business.language;
  if (business.currency) updatePayload.currency = business.currency;
  if (config.contact) updatePayload.contact_info = config.contact;
  if (config.hours) updatePayload.operating_hours = config.hours;
  if (config.policies) updatePayload.policies = config.policies;
  if (typeof config.knowledge_base === "string" && config.knowledge_base.trim()) {
    updatePayload.knowledge_base = config.knowledge_base.trim();
  }
  if (Object.keys(channels).length > 0) updatePayload.channels = channels;
  if (Object.keys(capabilities).length > 0) updatePayload.capabilities = capabilities;
  if (customerFields.length > 0) updatePayload.customer_fields = customerFields;

  if (Object.keys(updatePayload).length > 0) {
    const { error: updateErr } = await supabase
      .from("receptionists")
      .update(updatePayload)
      .eq("id", receptionistId);

    if (updateErr) {
      console.error("[config-versioning] Live revert failed:", updateErr);
      throw new Error(`Failed to apply revert to live system: ${updateErr.message}`);
    }
  }

  // Save the revert as a new version (documenting what happened)
  return saveConfigVersion(supabase, {
    receptionist_id: receptionistId,
    config_json: target.config_json,
    plan_text: target.plan_text || undefined,
    change_source: "owner_revert",
    owner_input: `Reverted to version ${targetVersionNumber}`,
    approved_by: revertedBy,
  });
}
