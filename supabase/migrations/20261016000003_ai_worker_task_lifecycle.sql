-- Durable state and audit metadata for the general-purpose AI Worker runtime.
-- Depends on 20261016000001_ai_worker_foundation.sql.
-- This migration does not start or execute tasks.

ALTER TABLE public.ai_worker_tasks
  ADD COLUMN IF NOT EXISTS worker_version integer NOT NULL DEFAULT 1
    CHECK (worker_version >= 1),
  ADD COLUMN IF NOT EXISTS worker_definition_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS approval_request jsonb,
  ADD COLUMN IF NOT EXISTS approval_request_hash text,
  ADD COLUMN IF NOT EXISTS approval_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz;

ALTER TABLE public.ai_worker_tasks
  ADD CONSTRAINT ai_worker_tasks_idempotency_key_length
  CHECK (idempotency_key IS NULL OR length(idempotency_key) BETWEEN 8 AND 200);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_worker_tasks_creator_idempotency
  ON public.ai_worker_tasks(created_by, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_worker_tasks_expired_leases
  ON public.ai_worker_tasks(lease_expires_at)
  WHERE status = 'running' AND lease_expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ai_worker_task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.ai_worker_tasks(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_kind text NOT NULL
    CHECK (actor_kind IN ('user', 'director', 'runner', 'verifier', 'system')),
  event_type text NOT NULL
    CHECK (event_type IN (
      'created', 'claimed', 'heartbeat', 'checkpoint_saved',
      'approval_requested', 'approval_granted', 'approval_rejected',
      'action_started', 'action_succeeded', 'action_failed',
      'verification_passed', 'verification_failed', 'completed',
      'blocked', 'failed', 'retried', 'cancelled', 'lease_expired'
    )),
  from_status text,
  to_status text,
  action_name text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(details) = 'object'),
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
              SELECT 1
              FROM public.organization_members om
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

-- Task writes and audit-event writes remain service-managed. Clients may only
-- read rows visible through the linked worker's tenant scope.
REVOKE INSERT, UPDATE, DELETE ON public.ai_worker_tasks FROM anon, authenticated;
GRANT SELECT ON public.ai_worker_tasks TO authenticated;
