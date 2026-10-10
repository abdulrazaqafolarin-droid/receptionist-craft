-- Director thread fidelity: assistant messages keep their proposals.
--
-- Resuming a Director chat used to drop every suggestion and action
-- (only role+content were stored), so reopened conversations lost
-- their proposals. metadata carries {suggestions, actions} for
-- assistant rows; the client restores them on open. build_messages is
-- untouched — this column exists only where proposals exist.

ALTER TABLE public.director_messages
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
