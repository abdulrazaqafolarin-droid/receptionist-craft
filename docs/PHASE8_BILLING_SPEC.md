# Phase 8 — FrontDesk Subscription Billing

## Current State
- `profiles.plan` enum: `"free" | "pro" | "enterprise"` — exists but no billing enforcement
- `_shared/payments/` module exists with Stripe and Paystack providers
- No `subscriptions` table, no billing page, no plan limits

## What Phase 8 Adds

### Schema
```sql
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',  -- active | past_due | cancelled | trial
  provider TEXT NOT NULL,                  -- stripe | paystack
  provider_subscription_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Plans
| Plan | Price | Receptionists | Customers | Messages/mo |
|------|-------|---------------|-----------|-------------|
| Free | $0 | 1 | 50 | 500 |
| Pro | $29/mo | 5 | 500 | 5,000 |
| Enterprise | $99/mo | Unlimited | Unlimited | Unlimited |

### Backend
- `subscriptions` table migration
- `check-plan-limit` edge function — enforces limits before creation
- Subscription webhook handler (Stripe/Paystack)

### Frontend
- `Billing.tsx` — plan comparison, current plan, upgrade button
- Route `/billing` + sidebar link
- Plan guard on receptionist/customer creation
