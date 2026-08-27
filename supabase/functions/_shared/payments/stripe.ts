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

export class StripeProvider implements PaymentProvider {
  readonly name = "stripe" as const;

  constructor(private config: ProviderConfig) {}

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

  async createIntent(params: CreateIntentParams): Promise<PaymentIntentResult> {
    const body = new URLSearchParams();
    body.append("amount", String(params.amount));
    body.append("currency", params.currency.toLowerCase());
    body.append("automatic_payment_methods[enabled]", "true");
    body.append(
      "metadata[payment_id]",
      params.metadata.payment_id ?? "",
    );
    body.append(
      "metadata[receptionist_id]",
      params.metadata.receptionist_id ?? "",
    );
    if (params.receipt_email) {
      body.append("receipt_email", params.receipt_email);
    }
    if (params.description) {
      body.append("description", params.description.slice(0, 500));
    }
    // Pass through all metadata
    for (const [k, v] of Object.entries(params.metadata)) {
      if (k !== "payment_id" && k !== "receptionist_id") {
        body.append(`metadata[${k}]`, String(v).slice(0, 500));
      }
    }

    const res = await fetch(`${this.apiBase()}/payment_intents`, {
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

    const pi = await res.json();
    return {
      id: pi.id,
      client_secret: pi.client_secret,
      status: pi.status,
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
    };

    const mappedType = typeMap[event.type];
    if (!mappedType) {
      throw new Error(`Unhandled Stripe event type: ${event.type}`);
    }

    const pi = event.data?.object;
    if (!pi) {
      throw new Error("Stripe event missing data.object");
    }

    return {
      type: mappedType,
      payment_id: pi.metadata?.payment_id ?? "",
      provider_ref: pi.id,
      amount: pi.amount ?? 0,
      metadata: pi.metadata ?? {},
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
  ): Promise<Record<string, unknown>> {
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
