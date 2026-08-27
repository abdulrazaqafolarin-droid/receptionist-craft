-- Phase 3: Payment Collection
-- Adds payments table with pluggable provider support (Stripe, Paystack)

-- Provider enum
DO $$ BEGIN
  CREATE TYPE public.payment_provider AS ENUM ('stripe', 'paystack');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Payment status enum
DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Payments table
CREATE TABLE IF NOT EXISTS public.payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id    UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  order_id          UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  receptionist_id   UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  amount            NUMERIC NOT NULL CHECK (amount > 0),
  currency          TEXT NOT NULL DEFAULT 'USD',
  provider          payment_provider NOT NULL,
  provider_ref      TEXT,
  provider_meta     JSONB DEFAULT '{}'::jsonb,
  status            payment_status NOT NULL DEFAULT 'pending',
  deposit_fraction  NUMERIC,
  receipt_url       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payments_appointment ON public.payments(appointment_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_receptionist ON public.payments(receptionist_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_provider_ref ON public.payments(provider_ref);

-- RLS
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can view payments" ON public.payments
  FOR SELECT USING (
    receptionist_id IN (
      SELECT id FROM public.receptionists WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert payments" ON public.payments
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can update payments" ON public.payments
  FOR UPDATE USING (true);

-- Add payment settings to integrations enum (if not already present)
DO $$ BEGIN
  ALTER TYPE public.integration_type ADD VALUE IF NOT EXISTS 'paystack';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_payments_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_payments_updated_at();
