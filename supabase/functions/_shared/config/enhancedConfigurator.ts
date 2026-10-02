/**
 * Enhanced Configurator — The AI Brain Behind Business Setup
 *
 * This is the core of the Universal Business Operator vision:
 * 1. Takes a business description (plain language)
 * 2. Reasons about what THIS specific business needs
 * 3. Produces both:
 *    a. A plain-language plan the owner can read and approve
 *    b. The OperationsConfig that plan compiles into
 * 4. Nothing goes live until the owner approves
 *
 * Routes through the Rutex gateway (Opencode) via _shared/rutexMcp.ts —
 * the SAME Configurator identity as onboard-configurator. No direct
 * Gemini calls.
 */

import { generatePlanFromConfig, type GeneratedPlan } from "./planGenerator.ts";
import { buildManifestPrompt } from "./manifest.ts";
import { buildSurfacePrompt } from "./surfaceManifest.ts";
import type { ReasoningHistoryEntry } from "./versioning.ts";
import { askRutex } from "../rutexMcp.ts";

interface ConfiguratorResult {
  plan: GeneratedPlan;
  config: Record<string, unknown>;
  reasoning_notes: string;
}

/** Route a Configurator prompt through the Rutex gateway (single identity). */
async function callGateway(kind: "operator" | "change", prompt: string): Promise<string> {
  const r = await askRutex(`configurator-${kind}-${crypto.randomUUID()}`, prompt);
  return r.text;
}

/** Parse the Configurator's strict-JSON reply, tolerating markdown fences. */
function parseConfiguratorJson(text: string): { config: Record<string, unknown>; reasoning_notes: string } {
  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) return JSON.parse(jsonMatch[1]);
    throw new Error("Could not parse configurator response as JSON");
  }
}

const SYSTEM_PROMPT = `You are the Configurator — an opencode agent for Rutex, an AI Business Operator platform for small businesses. You are accessed through the Rutex gateway. Your sibling is the Responder, the customer-facing agent also reached through the gateway.

You act as an expert business operations consultant: reason with care about each specific business, recommend the configuration that genuinely serves it, and flag uncertainty honestly.

Your job: take a business description and produce TWO things in ONE response:

1. **An OperationsConfig** — the structured configuration that the platform's runtime engine will execute.
2. **Reasoning notes** — your notes about WHY you chose each configuration option, especially where you're uncertain.

CRITICAL RULES:
- Reason about THIS SPECIFIC business, not a generic template.
- Only use capabilities that actually make sense for this business type.
- If the business description is ambiguous, make reasonable assumptions and note them.
- Never invent business details not in the description (prices, hours, etc.) — leave those fields null.
- knowledge_base: write 1-3 warm, conversational paragraphs (complete sentences, light bullet points where useful) that a customer-facing AI can use to answer questions about services, hours, policies, location, and typical FAQs. Never use field labels like "Business name:" — write it naturally.
- BEYOND BOOKING: not every owner wants a customer receptionist. Some want a helper operator (social content ideas and captions, posting checklists and reminders, general Q&A). When the need is not bookings/orders: set workflows to null/false, set booking capabilities false, write knowledge_base toward the helper role (process, rhythm, platforms, voice), and ALWAYS fill operator_kind, will_do, wont_do, and external_needs below. Never configure a booking flow for a need that has no customers booking anything.
- HONEST CONTRACT: will_do lists only outcomes the platform executes today (answers, ideas, drafts, checklists, reminders, bookings, orders, lead capture). wont_do lists what it will not do (auto-post to social accounts, access outside accounts, move money). external_needs lists each outside connector/API key required (e.g. "tiktok-auto-post") or an empty array. Never leave wont_do empty — there is always a boundary.
- For the config, follow this EXACT schema:
{
  "version": 1,
  "business": {
    "display_name": string,
    "legal_name": string | null,
    "business_type": string,
    "description": string | null,
    "greeting_message": string | null,
    "tone": "friendly" | "professional" | "playful"
  },
  "contact": {
    "phone": string | null,
    "email": string | null,
    "website": string | null,
    "address": string | null
  },
  "timezone": string,
  "hours": [
    { "day_of_week": number, "start_time": string, "end_time": string }
  ],
  "workflows": {
    "appointment_booking": { "enabled": boolean, "default_duration_minutes": number } | null,
    "product_ordering": { "enabled": boolean, "delivery": boolean } | null
  },
  "capabilities": {
    "sells_products": boolean,
    "books_appointments": boolean,
    "offers_services": boolean,
    "delivers": boolean,
    "requires_compliance": boolean,
    "supports_emergency": boolean,
    "deposit_required": boolean,
    "deposit_percent": number | null
  },
  "policies": {
    "cancellation_notice_hours": number | null,
    "same_day_booking": boolean,
    "walk_ins": boolean
  },
  "channels": {
    "widget": boolean,
    "whatsapp": boolean,
    "phone": boolean
  },
  "knowledge_base": string,
  "operator_kind": "receptionist" | "assistant" | "both",
  "will_do": string[],
  "wont_do": string[],
  "external_needs": string[],
  "ui_plan": {
    "show": [ { "key": string, "why": string } ],
    "hide": [ { "key": string, "why": string } ],
    "modules_on": [ { "key": string, "why": string } ],
    "connectors_needed": [ { "key": string, "why": string } ],
    "retention_on": [ { "key": string, "why": string } ],
    "widget_pieces": { "booking": boolean, "ordering": boolean, "voice": boolean, "lead_capture": boolean }
  }
}

SURFACE PLANNING (do this AFTER the config above):
- Decide the operator's dashboard surface from the SURFACE MANIFEST below: every operator-scope page is either shown or hidden, each with a one-line why. Account-scope pages are never listed (always on). Never invent a page key — use ONLY keys from the manifest.
- Switch on only the modules whose "when" tags match this business; a module needing an unconnected connector stays listed under modules_on but its connector ALSO lands in connectors_needed.
- Activate retention plays wherever their tags match.
- ui_plan lives INSIDE the config object above (config.ui_plan), so approval writes it straight through.

OUTPUT FORMAT (STRICT JSON, no markdown fences):
{
  "config": { ... the OperationsConfig above, INCLUDING ui_plan ... },
  "reasoning_notes": "Your detailed notes about WHY you chose each option, what you're confident about, and what you're uncertain about. Be honest about uncertainty."
}

${buildManifestPrompt()}

${buildSurfacePrompt()}`;

export async function generateOperatorPlan(
  businessDescription: string,
): Promise<ConfiguratorResult> {
  const userPrompt = `Business description from the owner:

"${businessDescription}"

Analyze this business description carefully. Think about:
- What does the owner actually want built — a customer receptionist, a helper operator (content, reminders, Q&A), or both?
- What type of business is this? What industry?
- Does it need appointments, product ordering, or both (or neither)?
- What's the typical customer interaction flow?
- Are there compliance requirements (medical, legal)?
- Does it need deposits? What cancellation policy makes sense?
- What tone fits this business?

Then produce the OperationsConfig and your reasoning notes.`;

  const text = await callGateway(
    "operator",
    `${SYSTEM_PROMPT}\n\n${userPrompt}`,
  );

  const parsed = parseConfiguratorJson(text);

  // Generate the plain-language plan from the config
  const plan = generatePlanFromConfig(parsed.config);

  return {
    plan,
    config: parsed.config,
    reasoning_notes: parsed.reasoning_notes,
  };
}

/**
 * Render the Configurator's reasoning-history trail (Step 8 / §4.1b). This is
 * the memory of WHY each past setting was chosen — every prior owner request,
 * the plan produced, and the agent's own reasoning. The SAME Configurator reads
 * this back so continuity is preserved across the business's lifetime.
 */
function buildReasoningHistoryPrompt(history: ReasoningHistoryEntry[]): string {
  if (!history || history.length === 0) return "";
  // Only entries that actually carry a decision ('why') — skip empty stubs.
  const meaningful = history.filter(
    (h) => h.owner_input || h.reasoning_notes || h.plan_text,
  );
  if (meaningful.length === 0) return "";

  const lines = meaningful.map((h, i) => {
    const who = h.owner_input ? `Owner requested: "${h.owner_input}"` : "";
    const why = h.reasoning_notes ? `Your reasoning then: ${h.reasoning_notes}` : "";
    const what = h.plan_text ? `Plan summary: ${h.plan_text.slice(0, 600)}` : "";
    return `#${meaningful.length - i} (config version ${h.version_number}, source: ${h.change_source})
${[who, why, what].filter(Boolean).join("\n")}`;
  }).join("\n\n");

  return `=== WHY THINGS ARE THE WAY THEY ARE (CONFIGURATOR'S PAST REASONING, newest first) ===
${lines}

Use this memory deliberately: if the owner refers to a past decision, recall it from here — do NOT ask them to re-explain something they already decided. If a new request conflicts with a past decision, acknowledge the conflict and flag it.`;
}

/**
 * Generate a plan for a configuration change (post-onboarding).
 * Takes the current config and the owner's requested change.
 */
export async function generateChangePlan(
  currentConfig: Record<string, unknown>,
  ownerChangeRequest: string,
  reasoningHistory: ReasoningHistoryEntry[] = [],
): Promise<ConfiguratorResult> {
  const systemPrompt = `You are the Configurator — an opencode agent for Rutex (accessed through the Rutex gateway; your sibling is the Responder agent for customers). You act as an expert business operations consultant: recommend changes that genuinely serve this business and flag uncertainty honestly. The business owner wants to change their AI operator's configuration.

You will receive:
1. The current configuration
2. The owner's change request (in plain language)
3. The reasoning-history trail — the WHY behind past decisions (may be empty if this is the first change)

Your job:
1. Produce the UPDATED OperationsConfig with the change applied
2. Note what specifically changed and why
3. Flag anything you're uncertain about

RULES:
- Only change what the owner asked for — don't restructure unrelated config
- If the change is ambiguous, make your best interpretation and note it
- If the change conflicts with existing config, resolve it reasonably and note the conflict
- The updated config must be valid and complete
- If the owner's change touches business knowledge (services, products, hours, policies, location, FAQs), update the config's knowledge_base text to match

OUTPUT FORMAT (STRICT JSON, no markdown fences):
{
  "config": { ... the updated OperationsConfig — same shape as onboarding, INCLUDING "knowledge_base": string and "ui_plan" ... },
  "reasoning_notes": "What changed, why, and what you're uncertain about"
}

If the change affects what the operator does (new capability, removed offering, new connector need), update config.ui_plan to match — show/hide the affected pages, switch modules, refresh connectors_needed and retention_on. Otherwise carry the existing ui_plan through untouched.

${buildManifestPrompt()}

${buildSurfacePrompt()}`;

  const userPrompt = `CURRENT CONFIGURATION:
${JSON.stringify(currentConfig, null, 2)}

OWNER'S CHANGE REQUEST:
"${ownerChangeRequest}"

${buildReasoningHistoryPrompt(reasoningHistory)}
Apply this change to the configuration. Only modify what's necessary.`;

  const text = await callGateway(
    "change",
    `${systemPrompt}\n\n${userPrompt}`,
  );

  const parsed = parseConfiguratorJson(text);

  const plan = generatePlanFromConfig(parsed.config);

  return {
    plan,
    config: parsed.config,
    reasoning_notes: parsed.reasoning_notes,
  };
}