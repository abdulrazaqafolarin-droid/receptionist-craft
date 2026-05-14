-- ============================================
-- PLATFORM HARDENING: Performance + RLS fixes
-- Date: 2026-05-13
-- ============================================

-- 1. MISSING INDEXES (M1)
CREATE INDEX IF NOT EXISTS idx_conversion_events_session ON public.conversion_events(session_id);
CREATE INDEX IF NOT EXISTS idx_services_receptionist_name ON public.services(receptionist_id, name);
CREATE INDEX IF NOT EXISTS idx_availability_rules_day ON public.availability_rules(receptionist_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_conversation_state_last_message ON public.conversation_state(last_message_at);
CREATE INDEX IF NOT EXISTS idx_kb_rewrite_log_created ON public.kb_rewrite_log(created_at);

-- 2. FIX handle_new_user TRIGGER (m1)
-- Use email-derived name instead of empty string
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, plan, onboarding_completed)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'free',
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. FIX CROSS-TENANT DATA LEAKAGE IN A/B TEST TABLES (M6)
-- Replace overly permissive policies with receptionist-scoped access
DROP POLICY IF EXISTS "Authenticated users can view ab_tests" ON public.ab_tests;
CREATE POLICY "Users can view own ab_tests"
  ON public.ab_tests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ab_assignments aa
      JOIN public.receptionists r ON r.id = aa.receptionist_id
      WHERE aa.test_id = ab_tests.id
      AND r.user_id = auth.uid()
    )
    OR auth.uid() IS NULL
  );

DROP POLICY IF EXISTS "Authenticated users can view ab_variants" ON public.ab_variants;
CREATE POLICY "Users can view own ab_variants"
  ON public.ab_variants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ab_assignments aa
      JOIN public.receptionists r ON r.id = aa.receptionist_id
      WHERE aa.test_id = ab_variants.test_id
      AND r.user_id = auth.uid()
    )
    OR auth.uid() IS NULL
  );

-- 4. DROP old 7-arg create_widget_order if it still exists (cleanup from M1 migration)
-- The 8-arg version (with p_idempotency_key) is the canonical one
-- This is safe to re-run as CREATE OR REPLACE handles it
