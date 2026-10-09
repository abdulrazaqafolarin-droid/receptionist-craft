-- Director presence: one row per autonomous run phase for live UI.
--
-- The sweep writes 'running' when a visible action starts and 'done'
-- when it finishes. The app subscribes via Realtime: the buddy flips to
-- working, the pill names the task, and the cursor replays the steps —
-- so autopilot is visible whenever the owner happens to be watching.
-- Short-lived rows by design; the ledger (director_actions) is the
-- permanent record, this table is the live signal.

CREATE TABLE IF NOT EXISTS public.director_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_id uuid REFERENCES public.director_actions(id) ON DELETE CASCADE,
  phase text NOT NULL CHECK (phase IN ('running', 'done')),
  label text NOT NULL DEFAULT '',
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_director_activity_user
  ON public.director_activity(user_id, created_at DESC);

ALTER TABLE public.director_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners read own director activity" ON public.director_activity;
CREATE POLICY "owners read own director activity" ON public.director_activity
  FOR SELECT USING (auth.uid() = user_id);

-- Realtime publication for the live presence channel.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'director_activity'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.director_activity;
  END IF;
END;
$$;
