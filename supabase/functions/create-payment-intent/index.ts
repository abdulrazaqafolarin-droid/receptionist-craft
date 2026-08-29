import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveProvider, PaymentProviderError } from "../_shared/payments/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * create-payment-intent — Phase 3 Payment Collection
 *
 * Creates a payment intent for a booking deposit or order.
 *
 * Input:
 *   - appointment_id OR order_id (at least one required)
 *   - receptionist_id (required)
 *
 * Flow:
 *   1. Load the appointment/order to get amount
 *   2. Look up receptionist's deposit settings (capabilities JSONB)
 *   3. Calculate payment amount (full or deposit fraction)
 *   4. Resolve payment provider from integrations table
 *   5. Create intent via provider API
 *   6. Insert into payments table
 *   7. Return client secret / authorization URL
 */

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""),
    );

    const body = await req.json().catch(() => ({}));
    const { appointment_id, order_id, receptionist_id } = body;

    if (!receptionist_id) {
      return jsonRes({ ok: false, error: "missing_receptionist_id" }, 400);
    }
    if (!appointment_id && !order_id) {
      return jsonRes({ ok: false, error: "missing_appointment_id_or_order_id" }, 400);
    }

    // ── 1. Load appointment or order ────────────────────────────────
    let amount = 0;
    let currency = "USD";
    let description = "";
    let customerEmail = "";
    let entityMeta: Record<string, string> = {};

    if (appointment_id) {
      const { data: appt } = await supabase
        .from("appointments")
        .select("id, service_id, service, customer_email, customer_name, metadata")
        .eq("id", appointment_id)
        .maybeSingle();

      if (!appt) {
        return jsonRes({ ok: false, error: "appointment_not_found" }, 404);
      }

      // Load service price
      if (appt.service_id) {
        const { data: svc } = await supabase
          .from("services")
          .select("price, name, currency")
          .eq("id", appt.service_id)
          .maybeSingle();

        if (svc?.price) {
          amount = Number(svc.price);
          currency = svc.currency || "USD";
          description = `Deposit for ${svc.name}`;
        }
      }

      customerEmail = appt.customer_email || "";
      entityMeta = {
        entity_type: "appointment",
        entity_id: appointment_id,
        customer_name: appt.customer_name || "",
      };
    }

    if (order_id) {
      const { data: order } = await supabase
        .from("orders")
        .select("id, total_amount, customer_email, customer_name, metadata")
        .eq("id", order_id)
        .maybeSingle();

      if (!order) {
        return jsonRes({ ok: false, error: "order_not_found" }, 404);
      }

      amount = Number(order.total_amount) || 0;
      description = "Order payment";
      customerEmail = order.customer_email || "";
      entityMeta = {
        entity_type: "order",
        entity_id: order_id,
        customer_name: order.customer_name || "",
      };
    }

    if (amount <= 0) {
      return jsonRes({ ok: false, error: "no_amount_to_charge" }, 400);
    }

    // ── 2. Check deposit settings ───────────────────────────────────
    const { data: receptionist } = await supabase
      .from("receptionists")
      .select("capabilities, currency")
      .eq("id", receptionist_id)
      .maybeSingle();

    const capabilities = (receptionist?.capabilities as Record<string, unknown>) ?? {};
    const depositRequired = capabilities.deposit_required === true;
    const depositPercent = Number(capabilities.deposit_percent) || 20;

    // Use receptionist's currency if set
    if (receptionist?.currency) {
      currency = receptionist.currency;
    }

    // ── 3. Calculate payment amount ─────────────────────────────────
    let paymentAmount: number;
    let depositFraction: number | null = null;

    if (depositRequired) {
      depositFraction = depositPercent / 100;
      // Convert to smallest currency unit (cents/kobo)
      paymentAmount = Math.round(amount * 100 * depositFraction);
    } else {
      // Full amount
      paymentAmount = Math.round(amount * 100);
    }

    if (paymentAmount <= 0) {
      return jsonRes({ ok: false, error: "calculated_amount_zero" }, 400);
    }

    // ── 4. Resolve payment provider ─────────────────────────────────
    const { provider } = await resolveProvider(supabase, receptionist_id);

    // ── 5. Insert pending payment record ────────────────────────────
    const paymentId = crypto.randomUUID();
    const { error: insertErr } = await supabase.from("payments").insert({
      id: paymentId,
      appointment_id: appointment_id || null,
      order_id: order_id || null,
      receptionist_id,
      amount: paymentAmount / 100, // store in major units for readability
      currency,
      provider: provider.name,
      status: "pending",
      deposit_fraction: depositFraction,
      provider_meta: entityMeta,
    });

    if (insertErr) {
      console.error("[create-payment-intent] Insert error:", insertErr);
      return jsonRes({ ok: false, error: "payment_record_failed" }, 500);
    }

    // ── 6. Create intent via provider ───────────────────────────────
    const metadata: Record<string, string> = {
      payment_id: paymentId,
      receptionist_id,
      ...entityMeta,
    };

    let result;
    try {
      result = await provider.createIntent({
        amount: paymentAmount,
        currency,
        receipt_email: customerEmail || undefined,
        description: description || undefined,
        metadata,
      });
    } catch (e) {
      // Mark payment as failed if provider call fails
      await supabase
        .from("payments")
        .update({ status: "failed", provider_meta: { ...entityMeta, error: String(e).slice(0, 500) } })
        .eq("id", paymentId);

      const msg = e instanceof Error ? e.message : String(e);
      console.error("[create-payment-intent] Provider error:", msg);
      return jsonRes({ ok: false, error: "provider_error", details: msg.slice(0, 300) }, 502);
    }

    // Update payment with provider reference
    await supabase
      .from("payments")
      .update({
        provider_ref: result.id,
        provider_meta: { ...entityMeta, provider_status: result.status },
      })
      .eq("id", paymentId);

    // ── 7. Return ───────────────────────────────────────────────────
    return jsonRes({
      ok: true,
      payment_id: paymentId,
      provider: provider.name,
      amount: paymentAmount / 100,
      currency,
      client_secret: result.client_secret || null,
      authorization_url: result.authorization_url || null,
    });
  } catch (e) {
    console.error("[create-payment-intent] Error:", e);
    if (e instanceof PaymentProviderError) {
      return jsonRes({ ok: false, error: e.kind, message: e.message }, 400);
    }
    return jsonRes({ ok: false, error: "internal_error" }, 500);
  }
});
