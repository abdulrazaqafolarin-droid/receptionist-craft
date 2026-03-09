import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "rutex_verify";
  const ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── Webhook verification (GET) ──────────────────────────────────────────────
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("[WhatsApp] Webhook verified");
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // ── Incoming messages (POST) ────────────────────────────────────────────────
  if (req.method === "POST") {
    try {
      const body = await req.json();
      console.log("[WhatsApp] Incoming payload:", JSON.stringify(body));

      const entry = body?.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;

      if (value?.messages?.length) {
        const msg = value.messages[0];
        const from = msg.from; // WhatsApp number
        const msgType = msg.type;

        // Only handle text messages for now
        if (msgType !== "text") {
          console.log(`[WhatsApp] Ignoring non-text message type: ${msgType}`);
          return new Response("ok", { status: 200 });
        }

        const userMessage: string = msg.text?.body ?? "";
        if (!userMessage.trim()) {
          return new Response("ok", { status: 200 });
        }

        // Use phone number as session ID
        const sessionId = `whatsapp_${from}`;

        // Look up receptionist tied to this WhatsApp phone number
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const { data: integration } = await supabase
          .from("integrations")
          .select("config_json, user_id")
          .eq("type", "whatsapp")
          .eq("enabled", true)
          .maybeSingle();

        if (!integration) {
          console.warn("[WhatsApp] No active WhatsApp integration found");
          return new Response("ok", { status: 200 });
        }

        const config = integration.config_json as Record<string, string> | null;
        const receptionistId: string | undefined = config?.receptionist_id;

        if (!receptionistId) {
          console.warn("[WhatsApp] No receptionist_id in integration config");
          return new Response("ok", { status: 200 });
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
            message: userMessage,
            receptionistId,
            sessionId,
            source: "whatsapp",
          }),
        });

        const chatData = await chatRes.json();
        const reply: string = chatData?.reply ?? chatData?.message ?? "Sorry, I couldn't process that.";

        // Send reply back via WhatsApp Cloud API
        if (ACCESS_TOKEN && PHONE_NUMBER_ID) {
          const waRes = await fetch(
            `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${ACCESS_TOKEN}`,
              },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                to: from,
                type: "text",
                text: { body: reply },
              }),
            }
          );
          if (!waRes.ok) {
            const errText = await waRes.text();
            console.error("[WhatsApp] Send error:", errText);
          }
        } else {
          console.warn("[WhatsApp] WHATSAPP_ACCESS_TOKEN or PHONE_NUMBER_ID not set – reply not sent");
        }
      }

      return new Response("ok", { status: 200 });
    } catch (err) {
      console.error("[WhatsApp] Error:", err);
      return new Response("ok", { status: 200 }); // Always 200 to Meta
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
});
