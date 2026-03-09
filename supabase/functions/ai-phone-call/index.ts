import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    // Parse Twilio form body
    const text = await req.text();
    const params = new URLSearchParams(text);
    const callSid = params.get("CallSid") ?? "unknown";
    const speechResult = params.get("SpeechResult") ?? "";
    const to = params.get("To") ?? "";

    console.log(`[PhoneCall] CallSid=${callSid} To=${to} Speech="${speechResult}"`);

    const sessionId = `phone_${callSid}`;

    // Look up receptionist tied to this Twilio phone number
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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

    // Route through the AI chat engine
    const chatUrl = `${SUPABASE_URL}/functions/v1/widget-chat`;
    const chatRes = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        message: speechResult,
        receptionistId,
        sessionId,
        source: "phone",
      }),
    });

    const chatData = await chatRes.json();
    const reply: string =
      chatData?.reply ?? chatData?.message ?? "I'm sorry, I had trouble understanding. Could you please try again?";

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
