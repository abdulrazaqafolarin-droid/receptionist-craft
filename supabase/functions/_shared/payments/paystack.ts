/**
 * Phase 3 — Paystack Payment Provider
 *
 * Implements the PaymentProvider interface for Paystack.
 * Uses Paystack's REST API directly — no SDK dependency.
 *
 * Flow:
 * 1. createIntent → POST /transaction/initialize (returns authorization_url)
 * 2. Customer redirected to Paystack's hosted page
 * 3. After payment, Paystack redirects back + sends webhook
 * 4. Webhook → charge.success → we mark payment completed
 *
 * Paystack amounts are in kobo (smallest NGN unit), so
 * ₦1000 = 100000 kobo.
 */

import type {
  PaymentProvider,
  CreateIntentParams,
  PaymentIntentResult,
  WebhookEvent,
  ProviderConfig,
} from "./types.ts";

export class PaystackProvider implements PaymentProvider {
  readonly name = "paystack" as const;

  constructor(private config: ProviderConfig) {}

  private get apiKey(): string {
    return this.config.secret_key;
  }

  private get webhookSecret(): string | undefined {
    return this.config.webhook_secret;
  }

  private apiBase(): string {
    return "https://api.paystack.co";
  }

  async createIntent(params: CreateIntentParams): Promise<PaymentIntentResult> {
    const body = {
      amount: params.amount, // Paystack expects amount in kobo (lowest denomination)
      currency: params.currency.toUpperCase(),
      email: params.receipt_email || "customer@example.com",
      reference: params.metadata.payment_id ?? `psk_${Date.now()}`,
      metadata: {
        payment_id: params.metadata.payment_id ?? "",
        receptionist_id: params.metadata.receptionist_id ?? "",
        custom_fields: [],
        ...params.metadata,
      },
      ...(params.description ? { note: params.description.slice(0, 500) } : {}),
    };

    const res = await fetch(`${this.apiBase()}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Paystack createIntent failed (${res.status}): ${err.slice(0, 300)}`);
    }

    const data = await res.json();
    if (!data.status) {
      throw new Error(`Paystack error: ${data.message ?? "unknown"}`);
    }

    return {
      id: data.data.reference,
      authorization_url: data.data.authorization_url,
      status: "pending", // Paystack transactions start as pending
    };
  }

  async verifyWebhook(
    body: string,
    headers: Record<string, string>,
  ): Promise<WebhookEvent> {
    const sigHeader = headers["x-paystack-signature"];
    if (!sigHeader || !this.webhookSecret) {
      throw new Error("Missing Paystack webhook signature or secret");
    }

    // Paystack signs the RAW request body with HMAC-SHA512 and sends the hex
    // digest in x-paystack-signature. Correct WebCrypto usage is to COMPUTE
    // the digest and compare it (crypto.subtle.verify needs the expected
    // signature AND the data — passing only the body was silently verifying
    // the payload against itself and rejecting every real payment).
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(this.webhookSecret),
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const computed = Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toLowerCase();

    if (computed !== sigHeader.trim().toLowerCase()) {
      throw new Error("Paystack webhook signature mismatch");
    }

    const event = JSON.parse(body);

    // Map Paystack event types to our internal types
    const typeMap: Record<string, WebhookEvent["type"]> = {
      "charge.success": "payment.completed",
      "charge.failed": "payment.failed",
      "refund.processed": "payment.refunded",
    };

    const mappedType = typeMap[event.event];
    if (!mappedType) {
      throw new Error(`Unhandled Paystack event type: ${event.event}`);
    }

    const tx = event.data;
    if (!tx) {
      throw new Error("Paystack event missing data");
    }

    return {
      type: mappedType,
      payment_id: tx.metadata?.payment_id ?? tx.reference ?? "",
      provider_ref: tx.reference,
      amount: tx.amount ?? 0,
      metadata: tx.metadata ?? {},
    };
  }

  constructReceiptUrl(providerRef: string): string | null {
    // Paystack doesn't have a public receipt URL,
    // but the transaction page can be accessed via the dashboard
    return null;
  }
}
