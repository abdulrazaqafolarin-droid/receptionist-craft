-- Director command queue: the brain's hands, in-app and (later) companion.
--
-- The gateway agent (the Director's brain) writes a command row; the
-- owner's browser — or a paired companion — executes it and posts the
-- result back. The brain reads the result and decides the next step.
-- That loop (look → reason → act → look again) is what turns answers
-- into done work. director_activity stays the live signal; this table
-- is the request/response channel. Every executed command also lands
-- in director_actions via the ledger, so the audit trail is complete.

CREATE TABLE IF NOT EXISTS public.director_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text NOT NULL DEFAULT '',
  tool text NOT NULL,
  args jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_director_commands_queue
  ON public.director_commands(user_id, status, created_at)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_director_commands_user
  ON public.director_commands(user_id, created_at DESC);

ALTER TABLE public.director_commands ENABLE ROW LEVEL SECURITY;

-- Owners read and complete their own commands (the browser executor
-- runs as the owner). Inserts come from the service role only (the
-- gateway-authenticated edge function) — no client-insert policy.
DROP POLICY IF EXISTS "owners read own commands" ON public.director_commands;
CREATE POLICY "owners read own commands" ON public.director_commands
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "owners finish own commands" ON public.director_commands;
CREATE POLICY "owners finish own commands" ON public.director_commands
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
