/**
 * Flow Spec — the step sequences the runtime engine executes (Tier 1).
 *
 * Mirrors supabase/functions/_shared/flow/ (types.ts, flowRouter.ts).
 * Step names here are REAL engine values — the Configurator reasons about
 * these exact steps when composing or hiding flows, and never invents
 * step names of its own.
 *
 * Deno-safe: ASCII only, no imports.
 */

export interface FlowStepDef {
  step: string; // real FlowStep value in the engine
  does: string; // what happens at this step, one line
  widget: string | null; // widget piece shown (surfaceManifest key context) or null
  blocking: boolean; // topic shifts are held here until resolved
}

export interface FlowDef {
  key: string;
  label: string;
  steps: FlowStepDef[];
  when: string; // relevance rule, one line
}

export const FLOWS: FlowDef[] = [
  {
    key: "booking",
    label: "Appointment booking (SERVICE flow)",
    when: "Enabled only with the booking tag — never configure steps for a business with no appointments.",
    steps: [
      { step: "select_service", does: "Visitor picks a service.", widget: "service_selector", blocking: false },
      { step: "select_date", does: "Visitor picks a date (availability-gated).", widget: "date_selector", blocking: false },
      { step: "select_time", does: "Visitor picks a time slot.", widget: "time_selector", blocking: false },
      { step: "collect_name", does: "Visitor gives a name.", widget: null, blocking: false },
      { step: "collect_contact", does: "Visitor gives phone or email.", widget: null, blocking: true },
      { step: "confirm", does: "Visitor confirms the booking summary.", widget: "booking_confirmation", blocking: true },
      { step: "complete", does: "Booking created via create_widget_appointment RPC; confirmation sent.", widget: null, blocking: false },
    ],
  },
  {
    key: "ordering",
    label: "Product ordering (PRODUCT flow)",
    when: "Enabled only with the ordering tag — never configure steps for a business that sells nothing.",
    steps: [
      { step: "select_product", does: "Visitor picks products.", widget: "product_selector", blocking: false },
      { step: "select_quantity", does: "Visitor sets quantities.", widget: "product_selector", blocking: false },
      { step: "collect_name", does: "Visitor gives a name.", widget: null, blocking: false },
      { step: "collect_contact", does: "Visitor gives phone or email.", widget: null, blocking: true },
      { step: "collect_location", does: "Delivery address (only when delivery is on).", widget: null, blocking: false },
      { step: "confirm", does: "Visitor confirms the order summary.", widget: "order_confirmation", blocking: true },
      { step: "complete", does: "Order created via create_widget_order RPC; confirmation sent.", widget: null, blocking: false },
    ],
  },
  {
    key: "lead_capture",
    label: "Lead capture (no purchase)",
    when: "Runs whenever serving customers, even with no booking or ordering — the floor of customer-facing work.",
    steps: [
      { step: "collect_name", does: "Visitor gives a name.", widget: null, blocking: false },
      { step: "collect_contact", does: "Visitor gives phone or email.", widget: "lead_form", blocking: false },
      { step: "complete", does: "Lead stored for follow-up.", widget: null, blocking: false },
    ],
  },
  {
    key: "escalation",
    label: "Human handoff",
    when: "Runs when the AI is unsure, the visitor asks for a human, or a sensitive topic appears.",
    steps: [
      { step: "collect_name", does: "Visitor identified for the handoff note.", widget: null, blocking: false },
      { step: "collect_contact", does: "Callback details captured.", widget: null, blocking: false },
      { step: "complete", does: "Escalation recorded; owner notified via notifications.", widget: null, blocking: false },
    ],
  },
];

export const CONVERSATION_PHASES: Array<{ phase: string; means: string }> = [
  { phase: "init", means: "Session opened, nothing said yet." },
  { phase: "greeting", means: "First exchange — greet exactly once." },
  { phase: "discovery", means: "Learning what the visitor wants." },
  { phase: "booking", means: "Inside the SERVICE flow steps." },
  { phase: "ordering", means: "Inside the PRODUCT flow steps." },
  { phase: "confirmation", means: "Awaiting explicit visitor confirmation." },
  { phase: "followup", means: "Post-visit win-back and recovery." },
  { phase: "closing", means: "Wrapping up with a next step, never a dead end." },
];

/** Build the flows block injected into the file-drop bundle. */
export function buildFlowsPrompt(): string {
  const flowLines = FLOWS.map(
    (f) => `- ${f.key} (${f.label}): ${f.when}\n` +
      f.steps.map((s) => `    ${s.step}: ${s.does}${s.widget ? ` [widget: ${s.widget}]` : ""}${s.blocking ? " [BLOCKING]" : ""}`).join("\n"),
  ).join("\n");
  const phaseLines = CONVERSATION_PHASES.map((p) => `- ${p.phase}: ${p.means}`).join("\n");
  return `=== FLOWS (step sequences the engine executes — use these exact step names) ===
${flowLines}

Conversation phases:
${phaseLines}

FLOW RULES:
1. Never invent a step name. Compose only from the steps above.
2. A flow with no matching business need is omitted entirely — steps, widgets, pages, all of it.
3. BLOCKING steps hold the conversation until resolved; never plan a topic shift inside one.`;
}
