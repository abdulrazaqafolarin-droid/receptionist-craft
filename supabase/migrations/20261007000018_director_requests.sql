-- Director ask channel: secure human input mid-task.
--
-- When the brain (gateway loop, sweep, runner task) needs something
-- only the owner can give — credentials, OTP codes, approvals,
-- choices, file names — it opens a request row instead of stopping
-- dead. The app holds a global outlet subscribed via Realtime; the
-- owner answers in a masked bottom-sheet; the waiter picks the answer
-- up and resumes. Pause is rows, not memory: nothing is lost if the
-- app restarts, because the pending row is still there.
--
-- Plaintext answers live ONLY in transit. Credential answers are
-- encrypted straight into the vault (never stored here); OTP answers
-- burn after first pickup. Approval/choice decisions stay as the
-- audit trail. RLS: service role writes; owners read + answer own
-- rows only. No client inserts, no deletes.

CREATE TABLE IF NOT EXISTS public.director_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text NOT NULL DEFAULT '',
  kind text NOT NULL CHECK (kind IN ('credential', 'approval', 'otp', 'choice', 'files')),
  title text NOT NULL DEFAULT '',
  service text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  purpose text NOT NULL DEFAULT '',
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  answer jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'answered', 'denied', 'cancelled', 'expired')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_director_requests_user
  ON public.director_requests(user_id, status, created_at DESC);

ALTER TABLE public.director_requests ENABLE ROW LEVEL SECURITY;

-- No policies on the base shape for anon/authenticated reads of
-- everything: two narrow policies below. Service role bypasses for
-- the brain edge.
DROP POLICY IF EXISTS "owners read own requests" ON public.director_requests;
CREATE POLICY "owners read own requests" ON public.director_requests
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "owners answer own requests" ON public.director_requests;
CREATE POLICY "owners answer own requests" ON public.director_requests
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Live outlet: the app subscribes to its pending rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'director_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.director_requests;
  END IF;
END;
$$;
