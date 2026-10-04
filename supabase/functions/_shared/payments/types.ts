/**
 * Phase 3 — Payment Provider Interface
 *
 * Every payment provider (Stripe, Paystack, future) implements this
 * interface. The edge functions only talk to this abstraction — they
 * never import provider-specific code directly.
 *
 * Design rule: the provider proves reachability, nothing more.
 * Our DB is the source of truth for payment status. Provider responses
 * are advisory until webhook-confirmed.
 */

// ── Provider Contract ───────────────────────────────────────────────

export type ProviderName = "stripe" | "paystack";

export interface CreateIntentParams {
  /** Amount in smallest currency unit (cents for USD/NGN kobo) */
  amount: number;
  /** ISO 4217 currency code */
  currency: string;
  /** Customer email for receipt */
  receipt_email?: string;
  /** Description shown on provider's payment page */
  description?: string;
  /** Our metadata — provider echoes this back in webhooks */
  metadata: Record<string, string>;
  /** Where the provider redirects after hosted checkout (Stripe) */
  success_url?: string;
  cancel_url?: string;
}

export interface PaymentIntentResult {
  /** Provider's payment intent / transaction ID */
  id: string;
  /** Client-side confirmation secret (Stripe) */
  client_secret?: string;
  /** Redirect URL for hosted payment page (Paystack) */
  authorization_url?: string;
  /** Provider's status string */
  status: string;
}

export type WebhookEventType =
  | "payment.completed"
  | "payment.failed"
  | "payment.refunded";

export interface WebhookEvent {
  type: WebhookEventType;
  /** Our internal payment ID (from metadata) */
  payment_id: string;
  /** Provider's reference ID */
  provider_ref: string;
  /** Amount in smallest currency unit */
  amount: number;
  /** Raw provider metadata */
  metadata: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly name: ProviderName;

  /**
   * Create a payment intent / initialize a transaction.
   * Returns enough info for the client to complete payment.
   */
  createIntent(params: CreateIntentParams): Promise<PaymentIntentResult>;

  /**
   * Verify a webhook signature and parse the event.
   * Throws if signature is invalid.
   */
  verifyWebhook(
    body: string,
    headers: Record<string, string>,
  ): Promise<WebhookEvent>;

  /**
   * Construct a receipt URL from a provider reference (if possible).
   */
  constructReceiptUrl(providerRef: string): string | null;
}

// ── Provider Config (from integrations table) ───────────────────────

export interface ProviderConfig {
  secret_key: string;
  webhook_secret?: string;
  publishable_key?: string;
  public_key?: string;
}

export function parseProviderConfig(
  configJson: unknown,
): ProviderConfig | null {
  if (!configJson || typeof configJson !== "object") return null;
  const c = configJson as Record<string, unknown>;
  if (typeof c.secret_key !== "string" || !c.secret_key) return null;
  return {
    secret_key: c.secret_key,
    webhook_secret: typeof c.webhook_secret === "string" ? c.webhook_secret : undefined,
    publishable_key: typeof c.publishable_key === "string" ? c.publishable_key : undefined,
    public_key: typeof c.public_key === "string" ? c.public_key : undefined,
  };
}
