/**
 * Permission Spec — who may touch what, in plain words (Tier 1).
 *
 * Mirrors the real RLS policies in supabase/migrations. The Configurator
 * must never plan a capability the database forbids — e.g. visitor-side
 * writes outside the widget RPCs, or one owner reading another's rows.
 *
 * Deno-safe: ASCII only, no imports.
 */

export interface PermissionDef {
  key: string;
  rule: string; // one line, plain words
}

export const PERMISSIONS: PermissionDef[] = [
  { key: "owner_rows", rule: "Owners read and write ONLY their own receptionists, services, appointments, orders, and customers (auth.uid() = user_id). Cross-owner access is impossible by policy." },
  { key: "owner_inserts", rule: "Owners can create only under their own user_id; config_versions is service-role-only (owners read, never write — approvals go through approve-operator-plan)." },
  { key: "widget_public", rule: "Anonymous visitors reach exactly one RPC: get_public_receptionist (safe columns + widget_surface booleans only). Everything else visitor-side runs server-side inside widget-chat." },
  { key: "widget_writes", rule: "Visitor bookings and orders are created ONLY through the atomic RPCs (create_widget_appointment, create_widget_order) with idempotency keys — never direct table writes." },
  { key: "service_role", rule: "Edge functions use the service role for cross-row work (reminders, versioning, research). Frontend anon key can never escalate to it." },
  { key: "connector_secrets", rule: "Connector credentials (OAuth tokens, API keys) live server-side in connectors rows; the widget and plans reference connector KEYS, never secrets." },
];

/** Build the permissions block injected into the file-drop bundle. */
export function buildPermissionsPrompt(): string {
  const lines = PERMISSIONS.map((p) => `- ${p.key}: ${p.rule}`).join("\n");
  return `=== PERMISSIONS (who may touch what — never plan what the database forbids) ===
${lines}

PERMISSION RULES:
1. Never plan visitor-side writes outside the atomic RPCs.
2. Never plan one owner seeing another owner's data — the policy makes it impossible, so promising it is a lie.
3. Plans reference connector keys; secrets are never in plans, prompts, or traces.`;
}
