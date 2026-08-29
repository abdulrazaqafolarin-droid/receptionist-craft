import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { forwardToWidgetChat, ChannelForwardError } from "../_shared/channelForward.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Build TwiML response
function twiml(content: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${content}</Response>`, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const RUTEX_SERVICE_ROLE_KEY = (Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");

  try {
    // Parse Twilio form body
    const text = await req.text();
    const params = new URLSearchParams(text);
    const callSid = params.get("CallSid") ?? "unknown";
    const speechResult = params.get("SpeechResult") ?? "";
    const to = params.get("To") ?? "";
    // Parity with WhatsApp sessions: key on the CALLER's number so returning
    // callers keep conversation history. Sanitize to [A-Za-z0-9].
    const callerId = (params.get("From") ?? "").replace(/[^a-zA-Z0-9]/g, "");

    console.log(`[PhoneCall] CallSid=${callSid} To=${to} From=${callerId || "hidden"} Speech="${speechResult}"`);

    // Fall back to CallSid only when Twilio hides the caller (anonymous calls).
    const sessionId = `phone_${callerId || callSid}`;

    // Look up receptionist tied to this Twilio phone number
    const supabase = createClient(SUPABASE_URL, RUTEX_SERVICE_ROLE_KEY);
    const { data: integration } = await supabase
      .from("integrations")
      .select("config_json")
      .eq("type", "twilio")
      .eq("enabled", true)
      .maybeSingle();

    const config = (integration?.config_json ?? {}) as Record<string, string>;
    const receptionistId: string | undefined = config?.receptionist_id;

    // ── First turn: no speech yet – play greeting ──────────────────────────
    if (!speechResult && receptionistId) {
      const { data: rec } = await supabase
        .from("receptionists")
        .select("greeting_message, business_name, name")
        .eq("id", receptionistId)
        .maybeSingle();

      const greeting =
        rec?.greeting_message ||
        `Hello, you've reached ${rec?.business_name ?? "our business"}. How can I help you today?`;

      return twiml(
        `<Gather input="speech" action="${SUPABASE_URL}/functions/v1/ai-phone-call" method="POST" speechTimeout="auto" language="en-US">` +
          `<Say voice="Polly.Joanna">${escapeXml(greeting)}</Say>` +
          `</Gather>` +
          `<Say voice="Polly.Joanna">I didn't catch that. Goodbye.</Say>`
      );
    }

    // ── Subsequent turns: process speech through AI ─────────────────────────
    if (!receptionistId) {
      return twiml(
        `<Say voice="Polly.Joanna">Sorry, this number is not configured. Goodbye.</Say>`
      );
    }

    if (!speechResult) {
      return twiml(
        `<Gather input="speech" action="${SUPABASE_URL}/functions/v1/ai-phone-call" method="POST" speechTimeout="auto">` +
          `<Say voice="Polly.Joanna">I didn't catch that, could you please repeat?</Say>` +
          `</Gather>`
      );
    }

    // Route through the AI chat engine (shared channel forwarder).
    // Twilio waits only ~15s for TwiML — keep the budget under that.
    let reply: string;
    try {
      const fwd = await forwardToWidgetChat({
        message: speechResult,
        receptionistId,
        sessionId,
        source: "phone",
        timeoutMs: 13_000,
      });
      reply = fwd.reply;
    } catch (e) {
      console.error("[PhoneCall] forward failed:", e);
      reply = "I'm sorry, that took a moment too long. Let's try again — how can I help?";
    }

    // Continue conversation
    return twiml(
      `<Gather input="speech" action="${SUPABASE_URL}/functions/v1/ai-phone-call" method="POST" speechTimeout="auto" language="en-US">` +
        `<Say voice="Polly.Joanna">${escapeXml(reply)}</Say>` +
        `</Gather>` +
        `<Say voice="Polly.Joanna">Thank you for calling. Goodbye.</Say>`
    );
  } catch (err) {
    console.error("[PhoneCall] Error:", err);
    return twiml(`<Say>We're experiencing technical difficulties. Please call back later.</Say>`);
  }
});

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
