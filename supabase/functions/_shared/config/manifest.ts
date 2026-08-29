/**
 * Capability & Component Manifest — the SINGLE source of truth for what the
 * platform can actually build with (§3.3 of FrontDesk-UIUX-Redesign).
 *
 * Purpose: every real operational capability AND every reusable frontend
 * component AND every backend piece (tables, RPCs, edge functions) that the
 * Configurator can assemble for a business. The Configurator's reasoning reads
 * THIS manifest — never an outdated internal assumption — so it cannot propose
 * a capability, a widget, or a connector that isn't actually there, and it
 * never rebuilds a piece that already exists (§3.1).
 *
 * Maintenance rule: when a capability or reusable piece is added/removed,
 * update this file. The Configurator prompt is composed from it at runtime, so
 * the reasoning stays grounded automatically.
 */

export type WorkflowKey = "appointment_booking" | "product_ordering";

export interface CapabilityDef {
  key: string;
  label: string;
  engine_hook: string; // where the runtime engine actually consumes it
  workflow?: WorkflowKey; // which workflow it maps to in OperationsConfig
}

export interface ComponentDef {
  key: string;
  label: string;
  path: string; // real import path in the frontend
  role: string; // what it's for (booking step, product picker, chat shell, etc.)
}

export interface BackendDef {
  key: string;
  kind: "table" | "rpc" | "edge_function";
  path: string;
  purpose: string;
}

/** Operational capabilities the engine genuinely supports (workflow types + flags). */
export const OPERATIONAL_CAPABILITIES: CapabilityDef[] = [
  {
    key: "appointment_booking",
    label: "Appointment booking",
    workflow: "appointment_booking",
    engine_hook: "OperationsConfig.workflows.appointment_booking + create_widget_appointment RPC",
  },
  {
    key: "product_ordering",
    label: "Product ordering",
    workflow: "product_ordering",
    engine_hook: "OperationsConfig.workflows.product_ordering + create_widget_order RPC",
  },
  {
    key: "sells_products",
    label: "Sells products",
    engine_hook: "BusinessCapabilities.sells_products → flow PRODUCT",
  },
  {
    key: "books_appointments",
    label: "Books appointments",
    engine_hook: "BusinessCapabilities.books_appointments → flow SERVICE",
  },
  {
    key: "offers_services_on_demand",
    label: "Offers services on demand (walk-in)",
    engine_hook: "BusinessCapabilities.offers_services_on_demand → flow SERVICE_ON_DEMAND",
  },
  {
    key: "delivers",
    label: "Delivery",
    engine_hook: "BusinessCapabilities.delivers / product_ordering.delivery",
  },
  {
    key: "requires_compliance",
    label: "Compliance needs",
    engine_hook: "BusinessCapabilities.requires_compliance → guardrails (no medical/legal advice)",
  },
  {
    key: "supports_urgent_requests",
    label: "Urgent requests",
    engine_hook: "BusinessCapabilities.supports_urgent_requests",
  },
  {
    key: "has_membership",
    label: "Membership / subscription",
    engine_hook: "BusinessCapabilities.has_membership + subscriptions table",
  },
];

/** Reusable frontend components that already exist — the Configurator ASSEMBLES these, never rebuilds them (§3.1/§3.4). */
export const REUSABLE_COMPONENTS: ComponentDef[] = [
  { key: "chat_shell", label: "Chat shell", path: "src/components/widget/ChatShell.tsx", role: "Shared chat widget (customer + configurator)" },
  { key: "service_selector", label: "Service selector", path: "src/components/widget/ServiceSelector.tsx", role: "Pick a service (booking step 1)" },
  { key: "date_selector", label: "Date selector", path: "src/components/widget/DateSelector.tsx", role: "Pick a date (booking step 2)" },
  { key: "time_slot_selector", label: "Time slot selector", path: "src/components/widget/TimeSlotSelector.tsx", role: "Pick a time (booking step 3)" },
  { key: "product_selector", label: "Product selector", path: "src/components/widget/ProductSelectorEnhanced.tsx", role: "Pick products + quantity (ordering)" },
  { key: "booking_confirmation", label: "Booking confirmation", path: "src/components/widget/BookingConfirmation.tsx", role: "Confirm a booking" },
  { key: "order_confirmation", label: "Order confirmation", path: "src/components/widget/OrderConfirmation.tsx", role: "Confirm an order" },
  { key: "lead_form", label: "Lead form", path: "src/components/widget/LeadForm.tsx", role: "Capture name/contact before handoff" },
  { key: "switch_confirmation", label: "Switch confirmation", path: "src/components/widget/SwitchConfirmation.tsx", role: "Confirm switching between booking and ordering" },
  { key: "voice_input", label: "Voice input", path: "src/components/widget/VoiceInputButton.tsx", role: "Speech-to-text input in the chat" },
  { key: "ui_signal_renderer", label: "UI signal renderer", path: "src/components/widget/UISignalRenderer.tsx", role: "Renders flow-step widgets from engine signals" },
  { key: "appointment_calendar", label: "Owner appointment calendar", path: "src/components/appointments/AppointmentCalendar.tsx", role: "Owner-side calendar view" },
  { key: "manage_booking_portal", label: "Manage booking portal", path: "src/components/ManageBookingPortal.tsx", role: "Owner manages/cancels bookings" },
  { key: "widget_customization", label: "Widget customization", path: "src/components/WidgetCustomization.tsx", role: "Owner themes/brands the chat widget" },
  { key: "inline_connect_prompt", label: "Inline connect prompt", path: "src/components/InlineConnectPrompt.tsx", role: "Surfaces a capability gap + connect action inline" },
  { key: "configurator_affordance", label: "Configurator affordance", path: "src/components/ConfiguratorAffordance.tsx", role: "Owner 'tell me what to change' entry point" },
  { key: "version_history", label: "Version history", path: "src/components/VersionHistory.tsx", role: "Owner sees past config versions + rollback" },
];

/** Backend pieces the engine and Configurator rely on. */
export const BACKEND_PIECES: BackendDef[] = [
  { key: "receptionists", kind: "table", path: "receptionists", purpose: "Central tenant config (capabilities, hours, channels, customer_fields)" },
  { key: "services", kind: "table", path: "services", purpose: "Products + services (is_product, stock, price, duration)" },
  { key: "appointments", kind: "table", path: "appointments", purpose: "Booking core" },
  { key: "orders", kind: "table", path: "orders", purpose: "Commerce core" },
  { key: "availability_rules", kind: "table", path: "availability_rules", purpose: "Schedule source of truth" },
  { key: "service_staff", kind: "table", path: "service_staff", purpose: "Staff-specific scheduling" },
  { key: "quote_requests", kind: "table", path: "quote_requests", purpose: "Quote-based (non-fixed-price) pricing" },
  { key: "booking_series", kind: "table", path: "booking_series", purpose: "Recurring bookings" },
  { key: "payments", kind: "table", path: "payments", purpose: "Payment collection" },
  { key: "subscriptions", kind: "table", path: "subscriptions", purpose: "Membership / subscription billing" },
  { key: "customers", kind: "table", path: "customers", purpose: "Customer records" },
  { key: "create_widget_appointment", kind: "rpc", path: "create_widget_appointment", purpose: "Creates an appointment atomically" },
  { key: "create_widget_order", kind: "rpc", path: "create_widget_order", purpose: "Creates an order atomically" },
  { key: "revert_config_version", kind: "rpc", path: "revert_config_version", purpose: "Rolls an operator back to a prior config version" },
  { key: "widget-chat", kind: "edge_function", path: "widget-chat", purpose: "Customer-facing AI responder (Gemini)" },
  { key: "book-appointment", kind: "edge_function", path: "book-appointment", purpose: "Backs the booking flow" },
  { key: "create-payment-intent", kind: "edge_function", path: "create-payment-intent", purpose: "Payment links (deposit/checkout)" },
  { key: "request-change", kind: "edge_function", path: "request-change", purpose: "Configurator change planning" },
  { key: "propose-operator-plan", kind: "edge_function", path: "propose-operator-plan", purpose: "Initial operator build from description" },
  { key: "approve-operator-plan", kind: "edge_function", path: "approve-operator-plan", purpose: "Applies an approved plan to live config" },
];

/**
 * §3.4 composition — given a business profile, return the set of EXISTING
 * pieces to assemble. If every need maps onto a `role` list, the operator can
 * be built by combining known pieces, never by generating new code/UI.
 */
export function composeForBusiness(profile: {
  booksAppointments?: boolean;
  sellsProducts?: boolean;
  offersOnDemand?: boolean;
  delivers?: boolean;
  hasMembership?: boolean;
}): { roles: string[]; notes: string[] } {
  const roles: string[] = [];
  const notes: string[] = [];

  roles.push("chat_shell");

  if (profile.booksAppointments || profile.offersOnDemand) {
    roles.push("service_selector", "date_selector", "time_slot_selector", "booking_confirmation");
    roles.push("appointment_calendar", "manage_booking_portal");
    notes.push("appointment capability assembled from existing booking widgets + appointments table.");
  }
  if (profile.sellsProducts || profile.delivers) {
    roles.push("product_selector", "order_confirmation");
    roles.push("create_widget_order RPC + orders table");
    notes.push("ordering capability assembled from existing product widgets + orders table.");
  }
  if (profile.hasMembership) {
    roles.push("subscriptions table + create-subscription-checkout edge function");
  }
  if (profile.booksAppointments && profile.sellsProducts) {
    roles.push("switch_confirmation");
    roles.push("ui_signal_renderer");
    notes.push("dual booking+ordering composed; switch_confirmation lets the customer move between flows.");
  }
  roles.push("ui_signal_renderer", "voice_input", "lead_form");
  roles.push("inline_connect_prompt", "configurator_affordance", "version_history");

  return { roles: [...new Set(roles)], notes };
}

/** Build the manifest block that is injected into the Configurator's system prompt. */
export function buildManifestPrompt(): string {
  const capLines = OPERATIONAL_CAPABILITIES.map(
    (c) => `- ${c.key}: ${c.label} (${c.engine_hook})`,
  ).join("\n");
  const compLines = REUSABLE_COMPONENTS.map(
    (c) => `- ${c.key} (${c.path}): ${c.role}`,
  ).join("\n");
  const backLines = BACKEND_PIECES.map(
    (b) => `- ${b.kind} ${b.key}: ${b.purpose}`,
  ).join("\n");

  return `=== WHAT THE PLATFORM HAS TODAY (MANIFEST — KNOW THIS INVENTORY) ===
Operational capabilities (the ENGINE supports ONLY these — enabling anything else produces an invalid config):
${capLines}

Reusable components that ALREADY EXIST (assemble these for a business — NEVER rebuild a component that is already here):
${compLines}

Backend pieces (tables / RPCs / edge functions) already present:
${backLines}

GUIDING RULE:
1. PREFER to configure each business by ASSEMBLING the existing capabilities and components above. When an existing piece fits a need, use it — do NOT rebuild a component that is already here.
2. This is NOT a closed list. When a business's need genuinely cannot be met by the existing pieces, INVENT the new code/UI/connector that the need calls for — inventing is allowed and expected when it's the right call. Just say clearly in your reasoning notes what you invented and why, so the platform knows it is new/missing from the manifest.
3. Never enable a capability that the engine does not support (the operational capabilities list above is the closed set of what the engine can execute — enabling anything else produces an invalid config). Frontend components and backend pieces, however, are the open inventory you assemble from and extend.`;
}
