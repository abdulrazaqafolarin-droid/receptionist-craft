/**
 * Data Entity Spec — the records the platform keeps (Tier 1).
 *
 * Real tables only (verified against supabase/migrations). The Configurator
 * reasons about what EXISTS to work with — it never plans a capability
 * whose records have nowhere to live.
 *
 * Deno-safe: ASCII only, no imports.
 */

export interface EntityDef {
  key: string; // real table name
  label: string;
  holds: string; // what lives here, one line
  mattersWhen: string[]; // relevance tags or ["always"]
}

export const ENTITIES: EntityDef[] = [
  { key: "receptionists", label: "Operator", holds: "Central tenant config: capabilities, ui_surface, hours, channels, knowledge.", mattersWhen: ["always"] },
  { key: "services", label: "Services & products", holds: "Unified catalog (is_product flag): price, stock, duration.", mattersWhen: ["booking", "ordering"] },
  { key: "appointments", label: "Appointments", holds: "Booking core: service, slot, visitor, idempotency-guarded.", mattersWhen: ["booking"] },
  { key: "orders", label: "Orders", holds: "Commerce core + order_items lines, idempotency-guarded.", mattersWhen: ["ordering"] },
  { key: "customers", label: "Customers", holds: "Visitor records built up across conversations.", mattersWhen: ["booking", "ordering", "customers"] },
  { key: "availability_rules", label: "Availability", holds: "Schedule source of truth + exceptions (holidays, sick days).", mattersWhen: ["booking"] },
  { key: "staff", label: "Staff", holds: "Team members; service_staff links staff to scheduling.", mattersWhen: ["staffed", "booking"] },
  { key: "escalations", label: "Escalations", holds: "Human-handoff queue with visitor context.", mattersWhen: ["customers"] },
  { key: "notifications", label: "Notifications", holds: "Owner alerts on bookings, orders, escalations.", mattersWhen: ["booking", "ordering", "customers"] },
  { key: "payments", label: "Payments", holds: "Deposit and checkout records (stripe/paystack providers).", mattersWhen: ["payments"] },
  { key: "subscriptions", label: "Subscriptions", holds: "Membership and recurring billing.", mattersWhen: ["payments"] },
  { key: "chat_messages", label: "Chat history", holds: "Verbatim history; last 30 feed engine memory.", mattersWhen: ["always"] },
  { key: "conversation_state", label: "Conversation state", holds: "Live slots, flow position, and phase per session.", mattersWhen: ["always"] },
  { key: "conversion_events", label: "Conversion events", holds: "Revenue funnel events for analytics and MEO.", mattersWhen: ["booking", "ordering", "payments"] },
  { key: "connectors", label: "Connectors", holds: "Per-owner connector status; definitions live in connector_definitions.", mattersWhen: ["connected"] },
  { key: "config_versions", label: "Config versions", holds: "Every approved plan snapshotted; rollback target.", mattersWhen: ["always"] },
];

/** Build the entities block injected into the file-drop bundle. */
export function buildEntitiesPrompt(): string {
  const lines = ENTITIES.map(
    (e) => `- ${e.key} (${e.label}): ${e.holds} [when: ${e.mattersWhen.join("|")}]`,
  ).join("\n");
  return `=== DATA (records the platform keeps — plan only what has somewhere to live) ===
${lines}

DATA RULES:
1. Never plan a capability whose records have nowhere to live above.
2. Prices, hours, and stock come from these records at runtime — never invent values the records do not hold.`;
}
