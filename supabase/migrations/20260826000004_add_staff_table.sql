-- Phase 6: Multi-Staff / Multi-Location Support

-- Staff table
CREATE TABLE IF NOT EXISTS public.staff (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  role            TEXT,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_receptionist ON public.staff(receptionist_id);
CREATE INDEX IF NOT EXISTS idx_staff_active ON public.staff(receptionist_id) WHERE active = true;

-- FK from availability_rules to staff (nullable — existing rules are business-level)
DO $$ BEGIN
  ALTER TABLE public.availability_rules ADD COLUMN staff_id UUID REFERENCES public.staff(id);
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_availability_rules_staff ON public.availability_rules(staff_id) WHERE staff_id IS NOT NULL;

-- Unique: one rule per staff per day (when staff assigned)
CREATE UNIQUE INDEX IF NOT EXISTS idx_availability_rules_staff_day_unique
  ON public.availability_rules(receptionist_id, staff_id, day_of_week)
  WHERE staff_id IS NOT NULL;

-- FK from appointments to staff (nullable — existing appointments unassigned)
DO $$ BEGIN
  ALTER TABLE public.appointments ADD COLUMN staff_id UUID REFERENCES public.staff(id);
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_appointments_staff ON public.appointments(staff_id) WHERE staff_id IS NOT NULL;

-- RLS
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can view staff" ON public.staff
  FOR SELECT USING (
    receptionist_id IN (
      SELECT id FROM public.receptionists WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage staff" ON public.staff
  FOR ALL USING (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_staff_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER staff_updated_at
  BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.update_staff_updated_at();
