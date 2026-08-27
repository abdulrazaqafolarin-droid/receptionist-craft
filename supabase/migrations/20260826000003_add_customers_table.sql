-- Phase 4: Customer Memory Across Visits
-- Creates unified customers table + FKs from appointments/orders

-- Customers table
CREATE TABLE IF NOT EXISTS public.customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,
  fingerprint     TEXT,
  metadata        JSONB DEFAULT '{}'::jsonb,
  visit_count     INTEGER NOT NULL DEFAULT 0,
  last_visit_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique: one customer per fingerprint per business
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_fingerprint_receptionist
  ON public.customers(receptionist_id, fingerprint)
  WHERE fingerprint IS NOT NULL;

-- Unique: one customer per email per business (when no fingerprint)
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email_receptionist
  ON public.customers(receptionist_id, email)
  WHERE email IS NOT NULL AND fingerprint IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_receptionist ON public.customers(receptionist_id);
CREATE INDEX IF NOT EXISTS idx_customers_last_visit ON public.customers(last_visit_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_fingerprint ON public.customers(fingerprint) WHERE fingerprint IS NOT NULL;

-- FK from appointments to customers (nullable — existing rows have no customer_id)
DO $$ BEGIN
  ALTER TABLE public.appointments ADD COLUMN customer_id UUID REFERENCES public.customers(id);
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_appointments_customer ON public.appointments(customer_id) WHERE customer_id IS NOT NULL;

-- FK from orders to customers
DO $$ BEGIN
  ALTER TABLE public.orders ADD COLUMN customer_id UUID REFERENCES public.customers(id);
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_customer ON public.orders(customer_id) WHERE customer_id IS NOT NULL;

-- RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can view customers" ON public.customers
  FOR SELECT USING (
    receptionist_id IN (
      SELECT id FROM public.receptionists WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert customers" ON public.customers
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can update customers" ON public.customers
  FOR UPDATE USING (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_customers_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_customers_updated_at();
