-- Director thread memory: verbatim-kept facts, not lossy summaries.
--
-- Long conversations outgrow any fixed message window. Instead of
-- summarizing (which invents and drops exact values), each thread
-- keeps a rolling brief of hard facts only: decisions made, names,
-- numbers, promises, open items — quoted exact, chatter dropped.
-- The chat packs brief + recent verbatim every turn, and refreshes
-- the brief about every 6 new messages. Service role only; the
-- client never reads or writes these rows directly.

CREATE TABLE IF NOT EXISTS public.director_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.director_threads(id) ON DELETE CASCADE,
  brief text NOT NULL DEFAULT '',
  briefed_through integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thread_id)
);

CREATE INDEX IF NOT EXISTS idx_director_memory_user
  ON public.director_memory(user_id, updated_at DESC);

ALTER TABLE public.director_memory ENABLE ROW LEVEL SECURITY;
-- Deny-all for anon/authenticated (no policies = deny). Service role
-- bypasses for the chat edge, which owns both reading and writing.
