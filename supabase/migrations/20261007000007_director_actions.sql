-- Director action ledger: every autonomous write, recorded and reversible.
--
-- The Director works solo on small tasks, so there is no human watching
-- each write happen. The ledger is what makes that safe instead of
-- reckless: one row per autonomous action with before/after, so any solo
-- action is auditable and undoable. Writers live in
-- supabase/functions/_shared/directorLedger.ts — every autonomous write
-- goes through them; there is no second path that skips the record.
-- This is NOT the deleted tour-receipt table: that recorded cursor runs.
-- This records changes to business data.

CREATE TABLE IF NOT EXISTS public.director_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receptionist_id uuid REFERENCES public.receptionists(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('bookkeeping', 'operator_draft', 'job_retry', 'report')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed', 'skipped')),
  summary text NOT NULL DEFAULT '',
  before jsonb NOT NULL DEFAULT '{}'::jsonb,
  after jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  visible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_director_actions_user
  ON public.director_actions(user_id, created_at DESC);

ALTER TABLE public.director_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners manage own director actions" ON public.director_actions;
CREATE POLICY "owners manage own director actions" ON public.director_actions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
