import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { forwardToWidgetChat, ChannelForwardError } from "../_shared/channelForward.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Constant-time string comparison — prevents timing attacks on the
 * HMAC signature check. Returns false on length mismatch.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verify Meta's X-Hub-Signature-256 header against the raw request body.
 * Meta computes HMAC-SHA256(app_secret, raw_body) and prefixes "sha256=".
 */
async function verifyMetaSignature(
  appSecret: string,
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const received = signatureHeader.slice("sha256=".length).toLowerCase();

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeEqual(received, expected);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── Configuration (fail-closed: no insecure defaults) ──────────────────
  const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
  const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET");
  const ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const RUTEX_SERVICE_ROLE_KEY = (Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");

  // ── Webhook verification (GET) ──────────────────────────────────────────────
  if (req.method === "GET") {
    if (!VERIFY_TOKEN) {
      console.error("[WhatsApp] WHATSAPP_VERIFY_TOKEN not configured");
      return new Response("Forbidden", { status: 403 });
    }
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token && timingSafeEqual(token, VERIFY_TOKEN)) {
      console.log("[WhatsApp] Webhook verified");
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // ── Incoming messages (POST) ────────────────────────────────────────────────
  if (req.method === "POST") {
    // Signature verification happens over the RAW body bytes — read them
    // before any JSON parsing.
    const rawBody = await req.text();

    if (!APP_SECRET) {
      console.error("[WhatsApp] WHATSAPP_APP_SECRET not configured — rejecting unverifiable payload");
      return new Response("Unauthorized", { status: 401 });
    }

    const isValid = await verifyMetaSignature(APP_SECRET, rawBody, req.headers.get("x-hub-signature-256"));
    if (!isValid) {
      console.warn("[WhatsApp] Invalid or missing X-Hub-Signature-256 — rejected");
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      const body = JSON.parse(rawBody);

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
        const supabase = createClient(SUPABASE_URL, RUTEX_SERVICE_ROLE_KEY);
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
        // Route through the AI chat engine (shared channel forwarder)
        let reply: string;
        try {
          const fwd = await forwardToWidgetChat({
            message: userMessage,
            receptionistId,
            sessionId,
            source: "whatsapp",
            timeoutMs: 55_000, // Meta re-delivers after ~60s; leave headroom
          });
          reply = fwd.reply;
        } catch (e) {
          const kind = e instanceof ChannelForwardError ? e.kind : "unreachable";
          console.error("[WhatsApp] forward failed:", kind, e);
          reply = kind === "timeout"
            ? "That took a little too long — could you send that again?"
            : "Sorry, I couldn't process that right now. Please try again in a moment.";
        }

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
