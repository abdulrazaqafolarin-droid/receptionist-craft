-- Migration: 20260826000012_add_business_modules.sql
-- Tracks which growth modules each business has enabled.

-- ── business_modules ───────────────────────────────────────────────
-- Which modules are active for this receptionist.
CREATE TABLE IF NOT EXISTS public.business_modules (
  id            uuid primary key default gen_random_uuid(),
  receptionist_id uuid not null references public.receptionists(id) on delete cascade,
  module_key   text not null,            -- e.g. "lead_generator", "email_responder"
  enabled      boolean not null default true,
  config_json  jsonb default '{}'::jsonb, -- per-module overrides (e.g. survey questions, reminder intervals)
  tier_override smallint,                 -- force a specific tier (rare — for power users)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(receptionist_id, module_key)
);

-- ── RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.business_modules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Owner can read own modules
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'business_modules_select_owner' AND tablename = 'business_modules') THEN
    CREATE POLICY business_modules_select_owner ON public.business_modules
      FOR SELECT USING (
        receptionist_id in (select id from public.receptionists where user_id = auth.uid())
      );
  END IF;

  -- Owner can insert own modules
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'business_modules_insert_owner' AND tablename = 'business_modules') THEN
    CREATE POLICY business_modules_insert_owner ON public.business_modules
      FOR INSERT WITH CHECK (
        receptionist_id in (select id from public.receptionists where user_id = auth.uid())
      );
  END IF;

  -- Owner can update own modules
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'business_modules_update_owner' AND tablename = 'business_modules') THEN
    CREATE POLICY business_modules_update_owner ON public.business_modules
      FOR UPDATE USING (
        receptionist_id in (select id from public.receptionists where user_id = auth.uid())
      );
  END IF;

  -- Owner can delete own modules
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'business_modules_delete_owner' AND tablename = 'business_modules') THEN
    CREATE POLICY business_modules_delete_owner ON public.business_modules
      FOR DELETE USING (
        receptionist_id in (select id from public.receptionists where user_id = auth.uid())
      );
  END IF;

  -- Service role full access
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'business_modules_service_role' AND tablename = 'business_modules') THEN
    CREATE POLICY business_modules_service_role ON public.business_modules
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- ── updated_at trigger ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_business_modules_updated_at()
RETURNS trigger AS $$
BEGIN
  new.updated_at = now();
  return new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS update_business_modules_updated_at ON public.business_modules;
CREATE TRIGGER update_business_modules_updated_at
  BEFORE UPDATE ON public.business_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_business_modules_updated_at();

-- ── Indexes ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_business_modules_receptionist ON public.business_modules(receptionist_id);

-- ── Default modules for existing receptionists ─────────────────────
-- Auto-enable Tier 1 modules for all existing receptionists
DO $$
DECLARE
  rec RECORD;
  tier1_modules text[] := ARRAY[
    'lead_generator',
    'content_generation',
    'analytics_digest',
    'competitor_monitoring'
  ];
  mod text;
BEGIN
  FOR rec IN SELECT id FROM public.receptionists LOOP
    FOREACH mod IN ARRAY tier1_modules LOOP
      INSERT INTO public.business_modules (receptionist_id, module_key, enabled)
      VALUES (rec.id, mod, true)
      ON CONFLICT (receptionist_id, module_key) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

COMMENT ON TABLE public.business_modules IS 'Tracks which growth modules each business has enabled. Modules self-report their tier.';
COMMENT ON COLUMN public.business_modules.module_key IS 'Module identifier: lead_generator, content_generation, email_responder, etc.';
COMMENT ON COLUMN public.business_modules.tier_override IS 'Force a specific tier (1/2/3). Null = auto-detect from connector status.';
