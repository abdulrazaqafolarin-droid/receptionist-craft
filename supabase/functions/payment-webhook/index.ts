import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveProvider, PaymentProviderError } from "../_shared/payments/index.ts";
import type { WebhookEvent } from "../_shared/payments/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * payment-webhook — Phase 3 Payment Collection
 *
 * Receives webhook callbacks from Stripe/Paystack after customer completes
 * payment. Verifies signature, updates payment status, and triggers
 * appointment/order confirmation.
 *
 * Flow:
 *   1. Parse provider from query param or auto-detect
 *   2. Look up provider config from integrations table
 *   3. Verify webhook signature
 *   4. Update payments table
 *   5. Confirm linked appointment or order
 *   6. Send receipt email (if customer email available)
 */

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Webhooks are POST only
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const rawBody = await req.text();
  const url = new URL(req.url);
  const providerParam = url.searchParams.get("provider") as "stripe" | "paystack" | null;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""),
    );

    // ── 1. Detect provider from headers ─────────────────────────────
    let providerName: "stripe" | "paystack" | null = providerParam;

    if (!providerName) {
      // Auto-detect from headers
      if (req.headers.get("stripe-signature")) {
        providerName = "stripe";
      } else if (req.headers.get("x-paystack-signature")) {
        providerName = "paystack";
      }
    }

    if (!providerName) {
      console.warn("[payment-webhook] Could not determine provider");
      return jsonRes({ ok: false, error: "unknown_provider" }, 400);
    }

    // ── 2. Find provider config ─────────────────────────────────────
    // We need ANY user's config for this provider — webhooks are global
    const { data: integration } = await supabase
      .from("integrations")
      .select("config_json, user_id")
      .eq("type", providerName)
      .eq("enabled", true)
      .limit(1)
      .maybeSingle();

    if (!integration?.config_json) {
      console.error(`[payment-webhook] No active ${providerName} integration found`);
      return jsonRes({ ok: false, error: "provider_not_configured" }, 500);
    }

    // Resolve provider
    const { resolveProvider: resolve } = await import("../_shared/payments/index.ts");
    const { parseProviderConfig } = await import("../_shared/payments/types.ts");
    const config = parseProviderConfig(integration.config_json);
    if (!config) {
      return jsonRes({ ok: false, error: "invalid_provider_config" }, 500);
    }

    const providerModule = await import(`../_shared/payments/${providerName}.ts`);
    const provider = new providerModule[
      providerName === "stripe" ? "StripeProvider" : "PaystackProvider"
    ](config);

    // ── 3. Verify & parse webhook ───────────────────────────────────
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => {
      headers[k] = v;
    });

    let event: WebhookEvent;
    try {
      event = await provider.verifyWebhook(rawBody, headers);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[payment-webhook] Signature verification failed:", msg);
      return jsonRes({ ok: false, error: "invalid_signature" }, 401);
    }

    console.log(`[payment-webhook] ${providerName}: ${event.type} for ${event.payment_id}`);

    // ── 4. Update payment status ────────────────────────────────────
    if (!event.payment_id) {
      // Try to find by provider_ref
      const { data: existingPayment } = await supabase
        .from("payments")
        .select("id")
        .eq("provider_ref", event.provider_ref)
        .maybeSingle();

      if (existingPayment) {
        event.payment_id = existingPayment.id;
      } else {
        console.warn("[payment-webhook] No payment found for ref:", event.provider_ref);
        return jsonRes({ ok: true, message: "payment_not_found_ignored" });
      }
    }

    const statusMap: Record<WebhookEvent["type"], string> = {
      "payment.completed": "completed",
      "payment.failed": "failed",
      "payment.refunded": "refunded",
    };

    const newStatus = statusMap[event.type];
    const { error: updateErr } = await supabase
      .from("payments")
      .update({
        status: newStatus,
        receipt_url: provider.constructReceiptUrl(event.provider_ref),
        provider_meta: {
          webhook_event: event.type,
          webhook_received_at: new Date().toISOString(),
          provider_ref: event.provider_ref,
          amount: event.amount,
        },
      })
      .eq("id", event.payment_id);

    if (updateErr) {
      console.error("[payment-webhook] Payment update error:", updateErr);
      return jsonRes({ ok: false, error: "update_failed" }, 500);
    }

    // ── 5. Confirm linked entity ────────────────────────────────────
    if (event.type === "payment.completed") {
      const { data: payment } = await supabase
        .from("payments")
        .select("appointment_id, order_id, receptionist_id, amount, currency")
        .eq("id", event.payment_id)
        .maybeSingle();

      if (payment?.appointment_id) {
        // Confirm the appointment
        await supabase
          .from("appointments")
          .update({ status: "confirmed" })
          .eq("id", payment.appointment_id)
          .eq("status", "booked"); // Only upgrade from booked → confirmed

        console.log(`[payment-webhook] Appointment ${payment.appointment_id} confirmed`);
      }

      if (payment?.order_id) {
        // Confirm the order
        await supabase
          .from("orders")
          .update({ status: "confirmed" })
          .eq("id", payment.order_id)
          .eq("status", "pending"); // Only upgrade from pending → confirmed

        console.log(`[payment-webhook] Order ${payment.order_id} confirmed`);
      }

      // ── 6. Send receipt notification ───────────────────────────────
      if (payment?.receptionist_id) {
        const { data: receptionist } = await supabase
          .from("receptionists")
          .select("user_id")
          .eq("id", payment.receptionist_id)
          .maybeSingle();

        if (receptionist?.user_id) {
          await supabase.from("notifications").insert({
            type: "payment.received",
            title: `Payment received: ${payment.currency} ${payment.amount}`,
            body: `A ${event.type === "payment.completed" ? "payment" : "refund"} of ${payment.currency} ${payment.amount} was processed.`,
            receptionist_id: payment.receptionist_id,
            user_id: receptionist.user_id,
            severity: "info",
            category: "payments",
            priority: "normal",
            metadata: {
              payment_id: event.payment_id,
              provider_ref: event.provider_ref,
              appointment_id: payment.appointment_id,
              order_id: payment.order_id,
            },
          });
        }
      }
    }

    // Always return 200 to provider (they retry on non-2xx)
    return jsonRes({ ok: true });
  } catch (e) {
    console.error("[payment-webhook] Error:", e);
    return jsonRes({ ok: true }); // Still 200 — don't provoke retries for our bugs
  }
});
