import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveProvider, PaymentProviderError } from "../_shared/payments/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apiapi, content-type",
};

const PLAN_PRICES: Record<string, { amount: number; label: string }> = {
  pro: { amount: 2900, label: "Pro Plan — $29/mo" },
  enterprise: { amount: 9900, label: "Enterprise Plan — $99/mo" },
};

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
    const { plan_id, user_id } = body;
    const success_url = typeof body.success_url === "string" ? body.success_url.slice(0, 2000) : undefined;
    const cancel_url = typeof body.cancel_url === "string" ? body.cancel_url.slice(0, 2000) : undefined;

    if (!plan_id || !user_id) {
      return jsonRes({ ok: false, error: "missing_plan_id_or_user_id" }, 400);
    }

    if (plan_id === "free") {
      return jsonRes({ ok: false, error: "free_plan_requires_no_checkout" }, 400);
    }

    const plan = PLAN_PRICES[plan_id];
    if (!plan) {
      return jsonRes({ ok: false, error: "unknown_plan" }, 400);
    }

    // Find the user's receptionist to resolve payment provider
    const { data: receptionist } = await supabase
      .from("receptionists")
      .select("id")
      .eq("user_id", user_id)
      .limit(1)
      .maybeSingle();

    if (!receptionist) {
      return jsonRes({ ok: false, error: "no_receptionist_found" }, 400);
    }

    // Try to resolve payment provider
    let provider;
    try {
      const resolved = await resolveProvider(supabase, receptionist.id);
      provider = resolved.provider;
    } catch (e) {
      // No payment provider configured — return manual upgrade path
      if (e instanceof PaymentProviderError && e.kind === "not_configured") {
        return jsonRes({
          ok: true,
          mode: "manual",
          message: "No payment provider connected. Contact support to upgrade.",
        });
      }
      throw e;
    }

    // Get user email for receipt
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user_id)
      .maybeSingle();

    const email = profile?.email || "";

    // Create payment record
    const paymentId = crypto.randomUUID();
    const { error: insertErr } = await supabase.from("payments").insert({
      id: paymentId,
      receptionist_id: receptionist.id,
      amount: plan.amount / 100,
      currency: "USD",
      provider: provider.name,
      status: "pending",
      provider_meta: {
        entity_type: "subscription",
        plan_id,
        user_id,
      },
    });

    if (insertErr) {
      console.error("[create-subscription-checkout] Insert error:", insertErr);
      return jsonRes({ ok: false, error: "payment_record_failed" }, 500);
    }

    // Create intent via provider
    const metadata: Record<string, string> = {
      payment_id: paymentId,
      receptionist_id: receptionist.id,
      entity_type: "subscription",
      plan_id,
      user_id,
    };

    let result;
    try {
      result = await provider.createIntent({
        amount: plan.amount,
        currency: "USD",
        receipt_email: email || undefined,
        description: plan.label,
        metadata,
        ...(success_url ? { success_url } : {}),
        ...(cancel_url ? { cancel_url } : {}),
      });
    } catch (e) {
      await supabase
        .from("payments")
        .update({ status: "failed", provider_meta: { error: String(e).slice(0, 500) } })
        .eq("id", paymentId);

      const msg = e instanceof Error ? e.message : String(e);
      console.error("[create-subscription-checkout] Provider error:", msg);
      return jsonRes({ ok: false, error: "provider_error", details: msg.slice(0, 300) }, 502);
    }

    // Update payment with provider reference
    await supabase
      .from("payments")
      .update({
        provider_ref: result.id,
        provider_meta: { entity_type: "subscription", plan_id, user_id, provider_status: result.status },
      })
      .eq("id", paymentId);

    return jsonRes({
      ok: true,
      mode: "checkout",
      payment_id: paymentId,
      provider: provider.name,
      amount: plan.amount / 100,
      currency: "USD",
      client_secret: result.client_secret || null,
      authorization_url: result.authorization_url || null,
    });
  } catch (e) {
    console.error("[create-subscription-checkout] Error:", e);
    if (e instanceof PaymentProviderError) {
      return jsonRes({ ok: false, error: e.kind, message: e.message }, 400);
    }
    return jsonRes({ ok: false, error: "internal_error" }, 500);
  }
});
