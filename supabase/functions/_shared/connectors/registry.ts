/**
 * Connector Registry — The foundation for the 3-tier system.
 *
 * Every module checks connector status live before acting.
 * A connector's tier determines what the module can actually do:
 *   Tier 1: Fully autonomous (connected)
 *   Tier 2: Drafts only (configured but not verified)
 *   Tier 3: Can't do it yet (not configured)
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Types ──────────────────────────────────────────────────────────

export type ConnectorStatus =
  | "not_configured"
  | "configured"
  | "connected"
  | "error"
  | "expired"
  | "rate_limited"
  | "deprecated";

export type ConnectorCategory =
  | "messaging"
  | "social"
  | "payments"
  | "calendar"
  | "reviews"
  | "storage"
  | "ads"
  | "auth"
  | "ai"
  | "other";

export interface Connector {
  id: string;
  user_id: string;
  connector_key: string;
  display_name: string;
  description: string | null;
  category: ConnectorCategory;
  status: ConnectorStatus;
  config_json: Record<string, unknown>;
  current_tier: number;
  last_health_check: string | null;
  last_error: string | null;
  connected_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConnectorDefinition {
  id: string;
  connector_key: string;
  display_name: string;
  description: string;
  category: ConnectorCategory;
  icon_name: string | null;
  brand_color: string | null;
  auth_type: "oauth" | "api_key" | "webhook" | "manual";
  setup_url: string | null;
  help_url: string | null;
  tier_1_description: string | null;
  tier_2_description: string | null;
  tier_3_description: string | null;
  oauth_scopes: string[] | null;
  oauth_provider: string | null;
  required_by_modules: string[] | null;
  is_google_family: boolean;
  supports_one_click_connect: boolean;
  is_coming_soon: boolean;
}

export interface ConnectorWithDefinition extends Connector {
  definition: ConnectorDefinition | null;
}

export interface TierCheckResult {
  connector_key: string;
  tier: 1 | 2 | 3;
  status: ConnectorStatus;
  can_autonomous: boolean;
  can_draft: boolean;
  message: string; // Plain-language explanation
}

// ── Core Functions ─────────────────────────────────────────────────

/**
 * Get all connectors for a user with their definitions.
 */
export async function getUserConnectors(
  supabase: SupabaseClient,
  userId: string,
): Promise<ConnectorWithDefinition[]> {
  const { data: connectors } = await supabase
    .from("connectors")
    .select("*")
    .eq("user_id", userId)
    .order("category");

  const { data: definitions } = await supabase
    .from("connector_definitions")
    .select("*");

  const defMap = new Map<string, ConnectorDefinition>();
  (definitions || []).forEach((d) => defMap.set(d.connector_key, d));

  return (connectors || []).map((c) => ({
    ...c,
    definition: defMap.get(c.connector_key) || null,
  }));
}

/**
 * Get all available connector definitions (the catalog).
 * Shows what COULD be connected, regardless of current status.
 */
export async function getConnectorCatalog(
  supabase: SupabaseClient,
): Promise<ConnectorDefinition[]> {
  const { data } = await supabase
    .from("connector_definitions")
    .select("*")
    .order("category");

  return (data || []) as ConnectorDefinition[];
}

/**
 * Check the live tier for a specific connector.
 * This is the function every module calls before acting.
 * Checks the DB, not a cached flag.
 */
export async function checkConnectorTier(
  supabase: SupabaseClient,
  userId: string,
  connectorKey: string,
): Promise<TierCheckResult> {
  const { data: connector } = await supabase
    .from("connectors")
    .select("status, current_tier")
    .eq("user_id", userId)
    .eq("connector_key", connectorKey)
    .maybeSingle();

  const { data: definition } = await supabase
    .from("connector_definitions")
    .select("tier_1_description, tier_2_description, tier_3_description")
    .eq("connector_key", connectorKey)
    .maybeSingle();

  const status = (connector?.status || "not_configured") as ConnectorStatus;
  const tier = (connector?.current_tier || 3) as 1 | 2 | 3;

  let message = "";
  if (tier === 1) {
    message = definition?.tier_1_description || "Fully autonomous.";
  } else if (tier === 2) {
    message = definition?.tier_2_description || "Drafts only — send manually.";
  } else {
    message = definition?.tier_3_description || "Not connected yet.";
  }

  return {
    connector_key: connectorKey,
    tier,
    status,
    can_autonomous: tier === 1,
    can_draft: tier <= 2,
    message,
  };
}

/**
 * Check multiple connectors at once (for modules that need several).
 * Returns the LOWEST tier across all required connectors.
 */
export async function checkModuleConnectors(
  supabase: SupabaseClient,
  userId: string,
  requiredConnectors: string[],
): Promise<{
  effective_tier: 1 | 2 | 3;
  checks: TierCheckResult[];
  all_autonomous: boolean;
  can_draft: boolean;
}> {
  const checks = await Promise.all(
    requiredConnectors.map((key) =>
      checkConnectorTier(supabase, userId, key),
    ),
  );

  const effectiveTier = Math.min(...checks.map((c) => c.tier)) as 1 | 2 | 3;
  const allAutonomous = checks.every((c) => c.can_autonomous);
  const canDraft = checks.some((c) => c.can_draft);

  return {
    effective_tier: effectiveTier,
    checks,
    all_autonomous: allAutonomous,
    can_draft: canDraft,
  };
}

/**
 * Update a connector's status (called after health checks or OAuth flows).
 */
export async function updateConnectorStatus(
  supabase: SupabaseClient,
  userId: string,
  connectorKey: string,
  status: ConnectorStatus,
  configJson?: Record<string, unknown>,
  error?: string,
): Promise<void> {
  const update: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
    last_health_check: new Date().toISOString(),
  };

  if (configJson) update.config_json = configJson;
  if (error) update.last_error = error;
  if (status === "connected") update.connected_at = new Date().toISOString();

  await supabase
    .from("connectors")
    .update(update)
    .eq("user_id", userId)
    .eq("connector_key", connectorKey);
}

/**
 * Upsert a connector (create if not exists, update if exists).
 */
export async function upsertConnector(
  supabase: SupabaseClient,
  userId: string,
  connectorKey: string,
  displayName: string,
  category: ConnectorCategory,
  configJson: Record<string, unknown>,
  status: ConnectorStatus = "configured",
): Promise<Connector> {
  const { data, error } = await supabase
    .from("connectors")
    .upsert(
      {
        user_id: userId,
        connector_key: connectorKey,
        display_name: displayName,
        category,
        config_json: configJson,
        status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,connector_key" },
    )
    .select()
    .single();

  if (error) throw error;
  return data as Connector;
}

/**
 * Get all connectors needed by a specific module.
 */
export async function getModuleConnectors(
  supabase: SupabaseClient,
  moduleKey: string,
): Promise<ConnectorDefinition[]> {
  const { data } = await supabase
    .from("connector_definitions")
    .select("*")
    .contains("required_by_modules", [moduleKey]);

  return (data || []) as ConnectorDefinition[];
}

/**
 * Initialize connectors for a new user.
 * Creates "not_configured" rows for all available connectors.
 */
export async function initializeUserConnectors(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data: definitions } = await supabase
    .from("connector_definitions")
    .select("connector_key, display_name, category");

  if (!definitions || definitions.length === 0) return;

  const rows = definitions.map((d) => ({
    user_id: userId,
    connector_key: d.connector_key,
    display_name: d.display_name,
    category: d.category,
    status: "not_configured" as const,
    config_json: {},
  }));

  await supabase.from("connectors").upsert(rows, {
    onConflict: "user_id,connector_key",
  });
}
