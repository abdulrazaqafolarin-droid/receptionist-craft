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
import { applyDerivedSurface } from "./surfaceDerivation.ts";
import { buildActorPrompt, validateActorPlan } from "./actorPlan.ts";
import { buildManifestPrompt } from "./manifest.ts";
import { buildSurfacePrompt } from "./surfaceManifest.ts";
import { buildSpecPrompt } from "./platformSpec.ts";
import type { ReasoningHistoryEntry } from "./versioning.ts";
import { askRutex, uploadContextFile, type AskResultText } from "../rutexMcp.ts";
import { TraceCollector } from "./trace.ts";

/**
 * File-drop flow (timeout fix): the full platform inventory is uploaded to
 * the gateway ONCE per planning call as a reference file, and the agent
 * prompt stays short — it reads the sections it needs with its read tool.
 * Fixed name: same content overwrites, so inventory updates propagate.
 * If the gateway predates /mcp-files (404), fall back to the full inline
 * prompt so planning keeps working against older gateways.
 */
const MANIFEST_BUNDLE_NAME = "rutex-platform-manifest.txt";

function buildInventoryBundle(): string {
  return `${buildManifestPrompt()}\n\n${buildSurfacePrompt()}\n\n${buildActorPrompt()}\n\n${buildSpecPrompt()}`;
}

/**
 * Phase 2c: the model may propose a guided tour (actor_plan), but code
 * decides what survives. Unknown/forbidden/malformed steps are rejected
 * with reasons in the trace; the sanitized list replaces the model's.
 * Runs on the FULL config (post-merge), like surface derivation.
 */
function applyActorPlanValidation(
  config: Record<string, unknown>,
  trace?: TraceCollector,
): void {
  if (config.actor_plan === undefined || config.actor_plan === null) {
    trace?.skip("validate-actor-plan", "No tour proposed", ["omit-is-normal"]);
    return;
  }
  trace?.start("validate-actor-plan");
  const report = validateActorPlan(config.actor_plan);
  config.actor_plan = report.valid;
  if (trace) {
    const facts = [
      `valid:${report.valid.length}`,
      ...report.rejected.slice(0, 5).map((r) => `rejected:${r.reason}`),
    ];
    if (report.rejected.length > 0) {
      trace.end("validate-actor-plan", "Tour sanitized — bad steps rejected, good steps kept", facts);
    } else {
      trace.end("validate-actor-plan", "Tour validated — every step targets real UI", facts);
    }
  }
}

async function uploadInventory(trace?: TraceCollector): Promise<string[] | null> {
  try {
    trace?.start("upload-manifest");
    const receipt = await uploadContextFile(MANIFEST_BUNDLE_NAME, buildInventoryBundle());
    if (!receipt.ok) {
      trace?.fail("upload-manifest", "Reference file upload rejected", "gateway refused the file");
      return null;
    }
    trace?.end("upload-manifest", receipt.cached ? "Reference file already on gateway (cached)" : "Reference file uploaded", [
      `file:${receipt.name}`,
      `${Math.round(receipt.bytes / 1024)}KB`,
      receipt.cached ? "cached" : "fresh upload",
    ]);
    return [receipt.name];
  } catch {
    trace?.fail("upload-manifest", "Reference file upload failed", "gateway predates file-drop — using full prompt");
    return null;
  }
}

interface ConfiguratorResult {
  plan: GeneratedPlan;
  config: Record<string, unknown>;
  reasoning_notes: string;
}

/** Route a Configurator prompt through the Rutex gateway (single identity). */
async function callGateway(
  kind: "operator" | "change",
  prompt: string,
  contextFiles?: string[],
  trace?: TraceCollector,
  timeoutMs?: number,
): Promise<AskResultText> {
  const r = await askRutex(`configurator-${kind}-${crypto.randomUUID()}`, prompt, { contextFiles, timeoutMs });
  trace?.end("gateway-ask", "AI planned the operator", [
    `model:${r.model || "unknown"}`,
    r.tokens ? `${r.tokens.input + r.tokens.output} tokens` : "tokens unreported",
  ]);
  return r;
}

/**
 * Prefer the short file-drop prompt; fall back to the full inline prompt
 * when the inventory upload fails (gateway predates /mcp-files).
 */
async function callGatewaySmart(
  kind: "operator" | "change",
  fullSystem: string,
  shortSystem: string,
  userPrompt: string,
  trace?: TraceCollector,
  timeoutMs?: number,
  noFiles?: boolean,
): Promise<string> {
  // noFiles escape hatch: skip file-drop entirely (diagnostics + fallback
  // when the agent's read step hangs). Caller passes it explicitly.
  if (noFiles) {
    trace?.skip("upload-manifest", "File-drop bypassed by caller", ["inline prompt"]);
    trace?.start("gateway-ask");
    try {
      const r = await callGateway(kind, `${fullSystem}\n\n${userPrompt}`, undefined, trace, timeoutMs);
      return r.text;
    } catch (e) {
      trace?.fail("gateway-ask", "AI planning failed", e instanceof Error ? e.message : String(e));
      throw e;
    }
  }
  const files = await uploadInventory(trace);
  trace?.start("gateway-ask");
  try {
    if (files) {
      const r = await callGateway(kind, `${shortSystem}\n\n${userPrompt}`, files, trace, timeoutMs);
      return r.text;
    }
    // Upload already recorded its own failure step; proceed inline.
    const r = await callGateway(kind, `${fullSystem}\n\n${userPrompt}`, undefined, trace, timeoutMs);
    return r.text;
  } catch (e) {
    trace?.fail("gateway-ask", "AI planning failed", e instanceof Error ? e.message : String(e));
    throw e;
  }
}

/** Parse the Configurator's strict-JSON reply, tolerating fences and surrounding prose. */
function parseConfiguratorJson(text: string): { config: Record<string, unknown>; reasoning_notes: string } {
  const candidates: string[] = [text];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) candidates.push(fence[1]);
  // Last resort: the outermost { ... } block (handles leading/trailing prose).
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));
  let lastErr: unknown = null;
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c) as { config?: Record<string, unknown>; reasoning_notes?: string };
      if (parsed && typeof parsed.config === "object" && parsed.config) {
        return {
          config: parsed.config,
          reasoning_notes: typeof parsed.reasoning_notes === "string" ? parsed.reasoning_notes : "",
        };
      }
    } catch (e) {
      lastErr = e;
    }
  }
  const preview = text.slice(0, 300).replace(/\s+/g, " ");
  throw new Error(
    `Could not parse configurator response as JSON (${String(lastErr)}. Preview: ${preview}`,
  );
}

const SYSTEM_BASE = `You are the Configurator — an opencode agent for Rutex, an AI Business Operator platform for small businesses. You are accessed through the Rutex gateway. Your sibling is the Responder, the customer-facing agent also reached through the gateway.

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
- INSIDE THE BUSINESS: some problems live inside the shop, not with customers — tracking stock and expiry, staff shifts and counts, daily tasks and records. For these set operator_kind to "ops": no customers tag in your reasoning, no booking/ordering workflows, no selling capabilities, knowledge_base written for the OWNER and STAFF (what gets tracked, who does what, when it reports). The ops modules (stockTracker, staffRoster, taskChaser) switch on from the internal tag — name them in modules_on when they fit, and say plainly what they cannot do yet (no supplier sync, no shelf vision).
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
  "operator_kind": "receptionist" | "assistant" | "both" | "ops",
  "actor_plan": [ { "type": "say|point|click|highlight|scroll-to|showcase|collect", "target": "registered actor key (see GUIDED TOURS)", "text"|"title"|"lines"|"connector_key"|"ms"|"say": ... } ],
  "will_do": string[],
  "wont_do": string[],
  "external_needs": string[],
  "build_needs": [ { "need": string, "why": string } ],
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
- ACTOR PLAN (optional guided tour, max 12 steps): propose one ONLY when a tour genuinely helps this operator (a connector to set up, a console to learn). Steps use registered actor keys only — unlisted targets are rejected automatically. Narration under 40 words per step. Omit the field entirely when no tour is needed; omission is normal, not a gap.
- SIZE DISCIPLINE (your reply must fit): every "why" is ONE short phrase, max 12 words. reasoning_notes max 5 sentences. No markdown, no fences, no commentary outside the JSON — the reply must BE the JSON object and nothing else.
- BUILD NEEDS (never leave a gap silent): if mid-build you lacked power (a tool you couldn't use), information (a fact nowhere in your reference file), or a capability (no action covers it), list each in build_needs with a one-line why. This is how the platform learns what to add next — an unlisted gap is a lie by omission. Empty array when nothing was missing.

OUTPUT FORMAT (STRICT JSON, no markdown fences):
{
  "config": { ... the OperationsConfig above, INCLUDING ui_plan ... },
  "reasoning_notes": "Max 5 sentences: WHY you chose each option, confidence, uncertainty. Be honest about uncertainty."
}`;

/**
 * Reference-file note appended INSTEAD of the full inventory when the
 * file-drop upload succeeded. The agent reads what it needs; the prompt
 * stays short and OpenCode stops timing out.
 */
const FILE_REF_NOTE = `
The full platform inventory (capabilities, components, backend, owner pages, connectors, modules, operations, flows, actions, data entities, states, permissions, runtime laws, page internals) is in your uploaded reference file — read the sections you need with the read tool BEFORE deciding. Its GUIDING RULE, COMPOSITION RULES, ACTION RULES, DATA RULES, STATE RULES, PERMISSION RULES, and LOGIC RULES bind you exactly as if pasted here. Never invent a capability, component, page, connector, module, flow step, action, or entity key — use ONLY keys from the reference file.`;

/** Full inline prompt (fallback when the gateway predates /mcp-files). */
const SYSTEM_PROMPT = `${SYSTEM_BASE}

${buildInventoryBundle()}`;

/** Short prompt: inventory arrives as a reference file the agent reads. */
const SYSTEM_PROMPT_SHORT = `${SYSTEM_BASE}
${FILE_REF_NOTE}`;

export async function generateOperatorPlan(
  businessDescription: string,
  trace?: TraceCollector,
  timeoutMs?: number,
  noFiles?: boolean,
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

  const text = await callGatewaySmart("operator", SYSTEM_PROMPT, SYSTEM_PROMPT_SHORT, userPrompt, trace, timeoutMs, noFiles);

  const parsed = parseConfiguratorJson(text);

  // Deterministic split (Phase A): the model decides meaning
  // (capabilities, workflows, kind); code decides surface. The model's
  // ui_plan is advisory — derivation overwrites it BEFORE the
  // plain-language plan is generated, so the text the owner reads
  // always matches the surface that will actually be written.
  applyDerivedSurface(parsed.config, trace);

  // Phase 2c: same split for tours — the model proposes actor_plan steps,
  // validation keeps only steps targeting real, allowed UI.
  applyActorPlanValidation(parsed.config, trace);

  // Generate the plain-language plan from the config
  const plan = generatePlanFromConfig(parsed.config);

  return {
    plan,
    config: parsed.config,
    reasoning_notes: parsed.reasoning_notes,
  };
}

/**
 * Slim config for change prompts: the model needs structure, not prose.
 * knowledge_base, solutions, and plan texts go along only as lengths —
 * sending them whole is what pushes change calls past the gateway timeout.
 */
function slimConfigForChange(config: Record<string, unknown>): Record<string, unknown> {
  const uiPlan = (config.ui_plan || {}) as {
    show?: Array<{ key?: unknown }>; hide?: Array<{ key?: unknown }>;
    widget_pieces?: unknown; modules_on?: Array<{ key?: unknown }>;
    connectors_needed?: Array<{ key?: unknown }>; retention_on?: Array<{ key?: unknown }>;
  };
  const keys = (l: Array<{ key?: unknown }> | undefined) =>
    (l || []).map((x) => x?.key).filter((k): k is string => typeof k === "string");
  const kb = typeof config.knowledge_base === "string" ? config.knowledge_base : "";
  return {
    operator_kind: config.operator_kind,
    business_type: (config.business as Record<string, unknown> | undefined)?.business_type,
    tone: (config.business as Record<string, unknown> | undefined)?.tone,
    capabilities: config.capabilities,
    workflows: config.workflows,
    channels: config.channels,
    policies: config.policies,
    timezone: config.timezone,
    hours_count: Array.isArray(config.hours) ? config.hours.length : 0,
    knowledge_base_chars: kb.length,
    will_do: config.will_do,
    wont_do: config.wont_do,
    external_needs: config.external_needs,
    ui_plan: {
      show: keys(uiPlan.show),
      hide: keys(uiPlan.hide),
      widget_pieces: uiPlan.widget_pieces,
      modules_on: keys(uiPlan.modules_on),
      connectors_needed: keys(uiPlan.connectors_needed),
      retention_on: keys(uiPlan.retention_on),
    },
  };
}
 
/**
 * Merge a change-plan result back onto the full current config.
 *
 * The model reasons over the SLIM config, so fields hidden from it
 * (knowledge_base prose, hours detail, contact detail) can never be
 * intentional changes — they always carry forward. Visible fields come
 * from the model, falling back to current when omitted. Without this,
 * slimming the prompt would silently wipe knowledge on every change.
 */
function mergeChangeConfig(
  current: Record<string, unknown>,
  parsed: Record<string, unknown>,
): Record<string, unknown> {
  const hidden = ["knowledge_base", "hours", "contact"];
  const out: Record<string, unknown> = { ...parsed };
  for (const k of hidden) {
    if (!(k in parsed) || parsed[k] === null || parsed[k] === "" ||
      (Array.isArray(parsed[k]) && (parsed[k] as unknown[]).length === 0)) {
      out[k] = current[k];
    }
  }
  for (const [k, v] of Object.entries(current)) {
    if (!(k in out) || out[k] === undefined) out[k] = v;
  }
  return out;
}
function buildReasoningHistoryPrompt(history: ReasoningHistoryEntry[]): string {
  if (!history || history.length === 0) return "";
  // Only entries that actually carry a decision ('why') — skip empty stubs.
  const meaningful = history.filter(
    (h) => h.owner_input || h.reasoning_notes || h.plan_text,
  );
  if (meaningful.length === 0) return "";

  const lines = meaningful.slice(0, 3).map((h, i) => {
    const who = h.owner_input ? `Owner requested: "${String(h.owner_input).slice(0, 300)}"` : "";
    const why = h.reasoning_notes ? `Your reasoning then: ${String(h.reasoning_notes).slice(0, 300)}` : "";
    return `#${meaningful.length - i} (config version ${h.version_number}, source: ${h.change_source})
${[who, why].filter(Boolean).join("\n")}`;
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
  trace?: TraceCollector,
  timeoutMs?: number,
  noFiles?: boolean,
): Promise<ConfiguratorResult> {
  const changeBase = `You are the Configurator — an opencode agent for Rutex (accessed through the Rutex gateway; your sibling is the Responder agent for customers). You act as an expert business operations consultant: recommend changes that genuinely serve this business and flag uncertainty honestly. The business owner wants to change their AI operator's configuration.

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

If the change affects what the operator does (new capability, removed offering, new connector need), update config.ui_plan to match — show/hide the affected pages, switch modules, refresh connectors_needed and retention_on. Otherwise carry the existing ui_plan through untouched. The same applies to config.actor_plan: refresh the tour only when the surface it walks changed, otherwise carry it through untouched (or omit it — omission is normal).`;

  const changeFull = `${changeBase}

${buildInventoryBundle()}`;
  const changeShort = `${changeBase}
${FILE_REF_NOTE}`;

  const userPrompt = `CURRENT CONFIGURATION (slim — structure only, prose lives in the records):
${JSON.stringify(slimConfigForChange(currentConfig), null, 2)}

OWNER'S CHANGE REQUEST:
"${ownerChangeRequest}"

${buildReasoningHistoryPrompt(reasoningHistory)}
Apply this change to the configuration. Only modify what's necessary.`;

  const text = await callGatewaySmart("change", changeFull, changeShort, userPrompt, trace, timeoutMs, noFiles);

  const parsed = parseConfiguratorJson(text);

  // Merge back onto the full config (slim-prompt safety — see mergeChangeConfig).
  const config = mergeChangeConfig(currentConfig, parsed.config);

  // Deterministic split (Phase A): derive AFTER the merge, so the
  // surface is computed from the final capabilities — the model's
  // updates where it made them, the current config's where it stayed
  // silent. Deriving before the merge would shrink the surface on
  // unrelated changes (model omits capabilities it did not touch).
  applyDerivedSurface(config, trace);
  // Phase 2c: tour validation on the same final config.
  applyActorPlanValidation(config, trace);
  const plan = generatePlanFromConfig(config);

  return {
    plan,
    config,
    reasoning_notes: parsed.reasoning_notes,
  };
}