-- Preserve the exact Director command that timed out so continue calls
-- poll the existing command instead of enqueuing a duplicate action.
ALTER TABLE public.director_tasks
  ADD COLUMN IF NOT EXISTS pending_command jsonb;
