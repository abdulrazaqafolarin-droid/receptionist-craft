import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  extractJsonBlock,
  validateOperationsConfig,
} from "../_shared/operationsConfigSchema.ts";
import { askRutex, RutexMcpError } from "../_shared/rutexMcp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version",
};

/**
 * onboard-configurator — Business Configuration Agent (Phase 1).
 *
 * Server-side seam to the Rutex AI Gateway via its Model Context Protocol
 * endpoint (supabase/functions/_shared/rutexMcp.ts):
 * - Env: RUTEX_GATEWAY_URL + RUTEX_GATEWAY_KEY (the `frontdesk` project key).
 *   NEVER browser-side; this function is the only caller.
 * - MCP tool used: rutex_ask { conversationId (required), prompt } → `text`.
 * - Client timeout ≥90s; gateway hard-caps at 120s.
 * - Gateway output is NEVER trusted: extracted JSON must pass
 *   validateOperationsConfig() before it is returned for state writes.
 */

function buildPrompt(description: string): string {
  return [
    "You are authoring an OperationsConfig for a business onboarding onto Rutex FrontDesk.",
    "",
    "BUSINESS DESCRIPTION:",
    description.trim(),
    "",
    "Respond with STRICT JSON only (no markdown fences, no commentary) matching exactly:",
    "{",
    '  "version": 1,',
    '  "business": { "display_name": string, "legal_name"?: string, "business_type": string, "description"?: string, "greeting_message"?: string, "tone"?: "friendly"|"professional"|"playful" },',
    '  "contact": { "phone"?: string, "email"?: string, "website"?: string, "address"?: string },',
    '  "timezone": "<IANA name, e.g. Africa/Lagos>",',
    '  "hours": [ { "day_of_week": 0-6 (0=Sunday), "start_time": "HH:mm", "end_time": "HH:mm" } ],',
    '  "workflows": {',
    '     "appointment_booking"?: { "enabled": boolean, "default_duration_minutes"?: number(5-480) },',
    '     "product_ordering"?: { "enabled": boolean, "delivery"?: boolean }',
    "  }",
    "}",
    "",
    "RULES:",
    "- Only these two workflow types exist. Never invent others.",
    "- Infer timezone from the business location; infer plausible hours for that business type when not stated.",
    "- Omit optional fields you cannot ground in the description. Do not guess contact details.",
    "- greeting_message: one warm sentence naming the business.",
  ].join("\n");
}

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => null);
    const description = typeof body?.description === "string" ? body.description.trim() : "";
    if (!description) return jsonRes({ ok: false, error: "empty_description" });

    // MCP path — helper maps failures to stable error codes and enforces
    // the ≥90s timeout guidance internally (gateway caps at 120s).
    let text = "";
    try {
      const r = await askRutex(`onboarding-${crypto.randomUUID()}`, buildPrompt(description));
      text = r.text;
    } catch (e) {
      const kind = e instanceof RutexMcpError ? e.kind : "unreachable";
      const map: Record<string, string> = {
        not_configured: "gateway_not_configured",
        auth: "gateway_auth_failed",
        timeout: "gateway_timeout",
        unreachable: "gateway_unreachable",
        tool_error: "gateway_empty_response",
        protocol: "gateway_protocol_error",
      };
      return jsonRes({ ok: false, error: map[kind] ?? "gateway_unreachable", issues: [String(e).slice(0, 200)] });
    }

    if (!text.trim()) return jsonRes({ ok: false, error: "gateway_empty_response" });

    let parsed: unknown;
    try {
      parsed = extractJsonBlock(text);
    } catch (e) {
      return jsonRes({ ok: false, error: "unparseable_response", issues: [String(e)] });
    }

    const validated = validateOperationsConfig(parsed);
    if (!validated.ok) {
      return jsonRes({ ok: false, error: "schema_validation_failed", issues: validated.issues });
    }

    return jsonRes({ ok: true, config: validated.data });
  } catch (e) {
    // Stability mode: never 5xx to the widget client.
    console.error("onboard-configurator error:", e);
    return jsonRes({ ok: false, error: "internal_error", issues: [String(e).slice(0, 300)] });
  }
});
