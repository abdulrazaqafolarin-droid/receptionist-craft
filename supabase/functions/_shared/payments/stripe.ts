/**
 * Phase 3 — Stripe Payment Provider
 *
 * Implements the PaymentProvider interface for Stripe.
 * Uses Stripe's REST API directly — no SDK dependency.
 *
 * Flow:
 * 1. createIntent → POST /v1/payment_intents (with automatic_payment_methods)
 * 2. Customer confirms on client using client_secret
 * 3. Webhook → payment_intent.succeeded → we mark payment completed
 */

import type {
  PaymentProvider,
  CreateIntentParams,
  PaymentIntentResult,
  WebhookEvent,
  ProviderConfig,
} from "./types.ts";

/** Stripe event envelope — typed so verify/map never falls back to unknown. */
interface StripeWebhookEvent {
  type: string;
  data?: { object?: Record<string, unknown> };
}

export class StripeProvider implements PaymentProvider {
  readonly name = "stripe" as const;

  constructor(private config: ProviderConfig) {}

  /** Stripe event object shape we actually read. */
  private get apiKey(): string {
    return this.config.secret_key;
  }

  private get webhookSecret(): string | undefined {
    return this.config.webhook_secret;
  }

  private apiBase(): string {
    // Support test mode (sk_test_...) and live mode (sk_live_...)
    return "https://api.stripe.com/v1";
  }

  /**
   * Hosted Checkout Session (redirect, same UX as Paystack) — NOT raw
   * PaymentIntents. The frontend has no Stripe.js integration, so intents
   * requiring client-side confirmation can never complete; Checkout
   * redirect works with zero client SDK.
   */
  async createIntent(params: CreateIntentParams): Promise<PaymentIntentResult> {
    // Return URLs: caller-provided first, FRONTEND_URL env second, live
    // domain last — never hardcoded per-environment beyond the fallback.
    const appBase = (params.success_url && params.success_url.split("/billing")[0]) ||
      Deno.env.get("FRONTEND_URL") ||
      "https://receptionist-craft.vercel.app";
    const successUrl = (params.success_url || `${appBase}/billing?checkout=success`).slice(0, 2000);
    const cancelUrl = (params.cancel_url || `${appBase}/billing?checkout=cancelled`).slice(0, 2000);
    const body = new URLSearchParams();
    body.append("mode", "payment");
    body.append("line_items[0][price_data][currency]", params.currency.toLowerCase());
    body.append("line_items[0][price_data][product_data][name]", (params.description || "Payment").slice(0, 500));
    body.append("line_items[0][price_data][unit_amount]", String(params.amount));
    body.append("line_items[0][quantity]", "1");
    body.append("success_url", successUrl);
    body.append("cancel_url", cancelUrl);
    if (params.receipt_email) {
      body.append("customer_email", params.receipt_email);
    }
    // Pass through all metadata (echoed back in checkout.session.completed)
    for (const [k, v] of Object.entries(params.metadata)) {
      body.append(`metadata[${k}]`, String(v).slice(0, 500));
    }

    const res = await fetch(`${this.apiBase()}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Stripe createIntent failed (${res.status}): ${err.slice(0, 300)}`);
    }

    const session = await res.json();
    if (!session.url) {
      throw new Error("Stripe checkout session returned no redirect URL");
    }
    return {
      id: session.id,
      authorization_url: session.url,
      status: session.status,
    };
  }

  async verifyWebhook(
    body: string,
    headers: Record<string, string>,
  ): Promise<WebhookEvent> {
    const sigHeader = headers["stripe-signature"];
    if (!sigHeader || !this.webhookSecret) {
      throw new Error("Missing Stripe webhook signature or secret");
    }

    // Verify signature using Stripe's v1 scheme
    const event = await this.verifyStripeSignature(
      body,
      sigHeader,
      this.webhookSecret,
    );

    // Map Stripe event types to our internal types
    const typeMap: Record<string, WebhookEvent["type"]> = {
      "payment_intent.succeeded": "payment.completed",
      "payment_intent.payment_failed": "payment.failed",
      "charge.refunded": "payment.refunded",
      "checkout.session.completed": "payment.completed",
      "checkout.session.expired": "payment.failed",
    };

    const mappedType = typeMap[event.type];
    if (!mappedType) {
      throw new Error(`Unhandled Stripe event type: ${event.type}`);
    }

    const pi = event.data?.object;
    if (!pi) {
      throw new Error("Stripe event missing data.object");
    }

    const meta = (pi.metadata || {}) as Record<string, string | undefined>;
    const amount = typeof pi.amount_total === "number" ? pi.amount_total : typeof pi.amount === "number" ? pi.amount : 0;

    return {
      type: mappedType,
      payment_id: meta.payment_id ?? "",
      provider_ref: typeof pi.id === "string" ? pi.id : "",
      amount,
      metadata: meta,
    };
  }

  constructReceiptUrl(providerRef: string): string | null {
    // Stripe dashboard URL — not a customer-facing receipt,
    // but useful for owner reference
    return `https://dashboard.stripe.com/payments/${providerRef}`;
  }

  // ── Stripe Signature Verification ──────────────────────────────────
  // Minimal implementation of Stripe's webhook signing scheme.
  // Uses HMAC-SHA256 with timestamps to prevent replay attacks.

  private async verifyStripeSignature(
    payload: string,
    signatureHeader: string,
    secret: string,
  ): Promise<StripeWebhookEvent> {
    const parts = signatureHeader.split(",");
    const sigMap: Record<string, string> = {};
    for (const part of parts) {
      const [key, val] = part.split("=");
      if (key && val) sigMap[key.trim()] = val.trim();
    }

    const timestamp = sigMap["t"];
    const expectedSig = sigMap["v1"];
    if (!timestamp || !expectedSig) {
      throw new Error("Invalid Stripe signature format");
    }

    // Reject if timestamp is older than 5 minutes (replay protection)
    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (age > 300) {
      throw new Error("Stripe webhook timestamp too old");
    }

    const signedPayload = `${timestamp}.${payload}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(signedPayload),
    );
    const computed = Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (computed !== expectedSig) {
      throw new Error("Stripe webhook signature mismatch");
    }

    return JSON.parse(payload);
  }
}
