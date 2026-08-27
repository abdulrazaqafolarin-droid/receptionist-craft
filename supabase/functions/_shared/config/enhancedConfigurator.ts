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
 * Uses Gemini directly (no Lovable gateway dependency).
 */

import { generatePlanFromConfig, type GeneratedPlan } from "./planGenerator.ts";

interface ConfiguratorResult {
  plan: GeneratedPlan;
  config: Record<string, unknown>;
  reasoning_notes: string;
}

const SYSTEM_PROMPT = `You are an expert business operations consultant working for Rutex FrontDesk, an AI Business Operator platform for small businesses.

Your job: take a business description and produce TWO things in ONE response:

1. **An OperationsConfig** — the structured configuration that the platform's runtime engine will execute.
2. **Reasoning notes** — your notes about WHY you chose each configuration option, especially where you're uncertain.

CRITICAL RULES:
- Reason about THIS SPECIFIC business, not a generic template.
- Only use capabilities that actually make sense for this business type.
- If the business description is ambiguous, make reasonable assumptions and note them.
- Never invent business details not in the description (prices, hours, etc.) — leave those fields null.
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
  }
}

OUTPUT FORMAT (STRICT JSON, no markdown fences):
{
  "config": { ... the OperationsConfig above ... },
  "reasoning_notes": "Your detailed notes about WHY you chose each option, what you're confident about, and what you're uncertain about. Be honest about uncertainty."
}`;

export async function generateOperatorPlan(
  businessDescription: string,
): Promise<ConfiguratorResult> {
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

  const userPrompt = `Business description from the owner:

"${businessDescription}"

Analyze this business description carefully. Think about:
- What type of business is this? What industry?
- Does it need appointments, product ordering, or both?
- What's the typical customer interaction flow?
- Are there compliance requirements (medical, legal)?
- Does it need deposits? What cancellation policy makes sense?
- What tone fits this business?

Then produce the OperationsConfig and your reasoning notes.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${userPrompt}` }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API failed (${res.status}): ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No content returned from Gemini");

  // Parse the JSON response
  let parsed: { config: Record<string, unknown>; reasoning_notes: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    // Try extracting JSON from markdown fences
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1]);
    } else {
      throw new Error("Could not parse configurator response as JSON");
    }
  }

  // Generate the plain-language plan from the config
  const plan = generatePlanFromConfig(parsed.config);

  return {
    plan,
    config: parsed.config,
    reasoning_notes: parsed.reasoning_notes,
  };
}

/**
 * Generate a plan for a configuration change (post-onboarding).
 * Takes the current config and the owner's requested change.
 */
export async function generateChangePlan(
  currentConfig: Record<string, unknown>,
  ownerChangeRequest: string,
): Promise<ConfiguratorResult> {
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

  const systemPrompt = `You are an expert business operations consultant. The business owner wants to change their AI operator's configuration.

You will receive:
1. The current configuration
2. The owner's change request (in plain language)

Your job:
1. Produce the UPDATED OperationsConfig with the change applied
2. Note what specifically changed and why
3. Flag anything you're uncertain about

RULES:
- Only change what the owner asked for — don't restructure unrelated config
- If the change is ambiguous, make your best interpretation and note it
- If the change conflicts with existing config, resolve it reasonably and note the conflict
- The updated config must be valid and complete

OUTPUT FORMAT (STRICT JSON, no markdown fences):
{
  "config": { ... the updated OperationsConfig ... },
  "reasoning_notes": "What changed, why, and what you're uncertain about"
}`;

  const userPrompt = `CURRENT CONFIGURATION:
${JSON.stringify(currentConfig, null, 2)}

OWNER'S CHANGE REQUEST:
"${ownerChangeRequest}"

Apply this change to the configuration. Only modify what's necessary.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API failed (${res.status}): ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No content returned from Gemini");

  let parsed: { config: Record<string, unknown>; reasoning_notes: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1]);
    } else {
      throw new Error("Could not parse change plan response as JSON");
    }
  }

  const plan = generatePlanFromConfig(parsed.config);

  return {
    plan,
    config: parsed.config,
    reasoning_notes: parsed.reasoning_notes,
  };
}
