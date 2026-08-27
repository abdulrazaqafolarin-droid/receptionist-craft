# PHASE 3 SPEC — Payment Collection

> Status: IN IMPLEMENTATION | Date: 2026-08-26
> Principle: **pluggable providers, clean module boundaries** — payment logic
> is its own layer, not entangled with booking or order logic. Reuses
> existing `orders`/`appointments` tables and `integrations` for config.

## 1. Architecture

```
Customer confirms booking/order
  └─ book-appointment / widget-chat order flow
       └─ IF deposit_required → create-payment-intent edge fn
            └─ PaymentProvider.createIntent(amount, currency, metadata)
                 ├─ Stripe: POST /v1/payment_intents
                 └─ Paystack: POST /transaction/initialize
            └─ INSERT INTO payments (id, appointment_id|order_id, amount, provider, provider_ref, status='pending')
            └─ Return { client_secret, provider, payment_id }
       └─ Widget shows payment button/link with client_secret
       └─ Customer completes payment on provider's hosted page
       └─ Provider sends webhook → payment-webhook edge fn
            └─ PaymentProvider.verifyWebhook(body, signature)
            └─ UPDATE payments SET status='completed'
            └─ UPDATE appointments SET status='confirmed' (or orders)
            └─ Send receipt email
```

## 2. Database Schema (migration)

```sql
CREATE TYPE public.payment_provider AS ENUM ('stripe', 'paystack');
CREATE TYPE public.payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded', 'cancelled');

CREATE TABLE public.payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  order_id        UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  amount          NUMERIC NOT NULL CHECK (amount > 0),
  currency        TEXT NOT NULL DEFAULT 'USD',
  provider        payment_provider NOT NULL,
  provider_ref    TEXT,           -- payment_intent_id / reference
  provider_meta   JSONB,         -- raw provider response for debugging
  status          payment_status NOT NULL DEFAULT 'pending',
  deposit_fraction NUMERIC,      -- e.g. 0.20 for 20% deposit
  receipt_url     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At least one of appointment_id or order_id must be set (enforced by CHECK or app logic)
CREATE INDEX idx_payments_appointment ON public.payments(appointment_id);
CREATE INDEX idx_payments_order ON public.payments(order_id);
CREATE INDEX idx_payments_receptionist ON public.payments(receptionist_id);
CREATE INDEX idx_payments_status ON public.payments(status);
CREATE INDEX idx_payments_provider_ref ON public.payments(provider_ref);

-- RLS: owner sees payments for their receptionists
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can view payments" ON public.payments
  FOR SELECT USING (
    receptionist_id IN (SELECT id FROM public.receptionists WHERE user_id = auth.uid())
  );
```

## 3. Provider Interface (`_shared/payments/types.ts`)

```typescript
interface PaymentProvider {
  name: 'stripe' | 'paystack';
  createIntent(params: CreateIntentParams): Promise<PaymentIntentResult>;
  verifyWebhook(body: string, headers: Record<string, string>): Promise<WebhookEvent>;
  constructReceiptUrl(providerRef: string): string | null;
}

interface CreateIntentParams {
  amount: number;          // smallest currency unit (cents/kobo)
  currency: string;        // 'USD', 'NGN', etc.
  receipt_email?: string;
  description?: string;
  metadata: Record<string, string>;
}

interface PaymentIntentResult {
  id: string;              // provider's payment intent ID
  client_secret?: string;  // for client-side confirmation (Stripe)
  authorization_url?: string; // for redirect-based flows (Paystack)
  status: string;
}

interface WebhookEvent {
  type: 'payment.completed' | 'payment.failed' | 'payment.refunded';
  payment_id: string;      // our internal ID (from metadata)
  provider_ref: string;
  amount: number;
  metadata: Record<string, unknown>;
}
```

## 4. Provider Config (via `integrations` table)

Each provider's keys are stored in the `integrations` table:
```json
{
  "type": "stripe",
  "config_json": {
    "secret_key": "sk_live_...",
    "webhook_secret": "whsec_...",
    "publishable_key": "pk_live_..."
  },
  "enabled": true
}
```

Paystack:
```json
{
  "type": "paystack",
  "config_json": {
    "secret_key": "sk_live_...",
    "webhook_secret": "...",
    "public_key": "pk_live_..."
  },
  "enabled": true
}
```

## 5. Deposit Model

- Per-receptionist setting: `receptionists.capabilities->>'deposit_required'` = `true`/`false`
- Per-receptionist setting: `receptionists.capabilities->>'deposit_percent'` = `20` (default 20%)
- If deposit required: `amount = service_price * (deposit_percent / 100)`
- If deposit not required: booking proceeds without payment, order requires full payment

## 6. Edge Functions

### `create-payment-intent`
- Input: `{ appointment_id?, order_id?, receptionist_id }`
- Loads receptionist → finds active payment provider integration
- Calculates amount from appointment service or order total
- Calls provider.createIntent()
- Inserts into `payments` table
- Returns `{ payment_id, client_secret|authorization_url, provider }`

### `payment-webhook`
- POST only, no auth (verified by provider signature)
- Stripes: verify `Stripe-Signature` header
- Paystack: verify HMAC signature
- Parse event → update payment status → trigger receipt

## 7. Tests

- Provider interface contract tests (mock HTTP)
- Deposit calculation tests
- Webhook signature verification tests
- Idempotent webhook handling (duplicate delivery)
- Payment→appointment status flow tests
