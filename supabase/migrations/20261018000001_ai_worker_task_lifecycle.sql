-- Durable worker task idempotency and append-only lifecycle audit.
-- This extends the worker foundation; it does not execute arbitrary code or
-- publish workers. Task writes remain restricted to trusted Edge Functions.

ALTER TABLE public.ai_worker_tasks
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS approval_request jsonb,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz;

ALTER TABLE public.ai_worker_tasks
  ADD CONSTRAINT ai_worker_tasks_idempotency_key_length
  CHECK (idempotency_key IS NULL OR length(idempotency_key) BETWEEN 8 AND 128);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_worker_tasks_idempotency
  ON public.ai_worker_tasks(worker_id, created_by, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ai_worker_task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.ai_worker_tasks(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'task_created', 'approval_granted', 'cancelled', 'cancel_requested',
    'status_changed', 'output_recorded', 'verification_recorded'
  )),
  from_status text CHECK (from_status IS NULL OR from_status IN (
    'queued', 'running', 'waiting_approval', 'done', 'blocked', 'failed', 'cancelled'
  )),
  to_status text CHECK (to_status IS NULL OR to_status IN (
    'queued', 'running', 'waiting_approval', 'done', 'blocked', 'failed', 'cancelled'
  )),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_worker_task_events_task_created
  ON public.ai_worker_task_events(task_id, created_at DESC);

ALTER TABLE public.ai_worker_task_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "worker task events visible through worker access" ON public.ai_worker_task_events;
CREATE POLICY "worker task events visible through worker access"
  ON public.ai_worker_task_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.ai_worker_tasks t
      JOIN public.ai_workers w ON w.id = t.worker_id
      WHERE t.id = ai_worker_task_events.task_id
        AND (
          (w.organization_id IS NULL AND w.created_by = (select auth.uid()))
          OR (
            w.organization_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.organization_members om
              WHERE om.organization_id = w.organization_id
                AND om.user_id = (select auth.uid())
                AND om.joined_at IS NOT NULL
            )
          )
        )
    )
  );

REVOKE ALL ON public.ai_worker_task_events FROM anon, authenticated;
GRANT SELECT ON public.ai_worker_task_events TO authenticated;
GRANT ALL ON public.ai_worker_task_events TO service_role;
GRANT ALL ON public.ai_worker_tasks TO service_role;

COMMENT ON TABLE public.ai_worker_task_events IS
  'Append-only audit trail for general AI Worker task lifecycle events; browser clients are read-only.';
COMMENT ON COLUMN public.ai_worker_tasks.idempotency_key IS
  'Client-generated request key used to prevent duplicate task creation on retries.';
COMMENT ON COLUMN public.ai_worker_tasks.approval_request IS
  'Trusted runner-produced description of the exact pending action requiring approval; never treat user-supplied input as approval metadata.';
