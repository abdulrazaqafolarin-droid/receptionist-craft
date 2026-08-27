# PHASE 4 SPEC — Customer Memory Across Visits

> Status: IN IMPLEMENTATION | Date: 2026-08-26
> Principle: **unified customer entity** — one `customers` table with
> foreign keys from `appointments` and `orders`. Existing fingerprint
> system is preserved and enhanced. AI gets full visit history, owners
> get a customer list.

## 1. Problem

Customer data is scattered as free-text columns across `appointments`
and `orders`. The fingerprint system detects returning visitors via
conversation summaries, but:
- The AI can't see actual booking/order history (only conversation summaries)
- Owners have no customer list or relationship view
- No unified customer profile across bookings and orders
- Name-only customers (no email/phone) are never tracked

## 2. Architecture

```
Customer books appointment / places order
  └─ Upsert into `customers` table (match by fingerprint or name+receptionist)
  └─ Link appointment.order → customer_id FK

Widget-chat detects returning customer
  └─ Load customer record by fingerprint
  └─ Load last 5 appointments + last 5 orders
  └─ Surface full history to AI prompt (not just summaries)

Owner opens Customers page
  └─ List all customers for their receptionists
  └─ Click → customer detail with visit history
```

## 3. Database Schema

```sql
CREATE TABLE public.customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,
  fingerprint     TEXT,  -- 'email:...' or 'tel:...'
  metadata        JSONB DEFAULT '{}'::jsonb,
  visit_count     INTEGER NOT NULL DEFAULT 0,
  last_visit_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One customer per contact per business
CREATE UNIQUE INDEX idx_customers_fingerprint_receptionist
  ON public.customers(receptionist_id, fingerprint)
  WHERE fingerprint IS NOT NULL;

-- Fallback: unique by email+receptionist when no fingerprint
CREATE UNIQUE INDEX idx_customers_email_receptionist
  ON public.customers(receptionist_id, email)
  WHERE email IS NOT NULL AND fingerprint IS NULL;

CREATE INDEX idx_customers_receptionist ON public.customers(receptionist_id);
CREATE INDEX idx_customers_last_visit ON public.customers(last_visit_at DESC);

-- FK from appointments
ALTER TABLE public.appointments ADD COLUMN customer_id UUID REFERENCES public.customers(id);
CREATE INDEX idx_appointments_customer ON public.appointments(customer_id);

-- FK from orders
ALTER TABLE public.orders ADD COLUMN customer_id UUID REFERENCES public.customers(id);
CREATE INDEX idx_orders_customer ON public.orders(customer_id);
```

## 4. Customer Resolution (`_shared/customers/resolveCustomer.ts`)

Given a receptionist_id + contact info → find or create customer:
1. Compute fingerprint from email or phone
2. If fingerprint exists → lookup by (receptionist_id, fingerprint)
3. If no fingerprint → lookup by (receptionist_id, name) with LIMIT 1
4. If no match → INSERT new customer record
5. Update `visit_count` and `last_visit_at`

## 5. AI Context Enrichment (`_shared/customers/getCustomerHistory.ts`)

Given a customer_id → load last N visits:
- Last 5 appointments (service, date, status)
- Last 5 orders (items, total, date, status)
- Format as a structured block for the AI prompt

This replaces the current limited `returningCustomerBlock` that only
has conversation summary text.

## 6. widget-chat Integration

After fingerprint is computed (existing code), add:
1. Call `resolveCustomer()` to find/create customer record
2. If returning customer: call `getCustomerHistory()` 
3. Replace the current summary-only returning block with full history
4. Store `customer_id` in conversation_state.slots for later use

## 7. Owner-Facing UI (`src/pages/Customers.tsx`)

- List view: name, email, phone, visit count, last visit
- Detail view: full appointment + order history
- Route: `/customers` in App.tsx
- Sidebar entry in AppSidebar

## 8. Tests

- Customer resolution: fingerprint match, name fallback, new customer creation
- History loading: correct joins, ordering, limits
- Idempotency: duplicate bookings don't create duplicate customers
- Visit count accuracy
