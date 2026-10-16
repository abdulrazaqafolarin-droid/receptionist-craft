-- Rutex AI Worker foundation: persistent worker definitions and execution records.
--
-- This deliberately does NOT replace receptionists, director_tasks, or plan_jobs:
-- - receptionists remain customer-facing conversational operators.
-- - director_tasks remain the current browser/device task loop.
-- - plan_jobs remain receptionist configuration planning jobs.
-- - ai_workers are durable, general-purpose worker definitions.
-- - ai_worker_tasks are durable records for work assigned to those workers.
--
-- User-facing task state transitions should be performed by trusted Edge Functions
-- using the service role. Authenticated clients receive read access only to tasks.
-- This migration creates the persistence boundary; it does not claim that the
-- generic worker runtime or UI already exists.

CREATE TABLE IF NOT EXISTS public.ai_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'building', 'testing', 'active', 'paused', 'archived')),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_workers_creator_updated
  ON public.ai_workers(created_by, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_workers_org_updated
  ON public.ai_workers(organization_id, updated_at DESC)
  WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_workers_status
  ON public.ai_workers(status, updated_at DESC);

ALTER TABLE public.ai_workers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai workers visible to creator or joined org members" ON public.ai_workers;
CREATE POLICY "ai workers visible to creator or joined org members"
  ON public.ai_workers FOR SELECT TO authenticated
  USING (
    (organization_id IS NULL AND created_by = auth.uid())
    OR (
      organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.organization_id = ai_workers.organization_id
          AND om.user_id = auth.uid()
          AND om.joined_at IS NOT NULL
      )
    )
  );

DROP POLICY IF EXISTS "users create own workers in permitted scope" ON public.ai_workers;
CREATE POLICY "users create own workers in permitted scope"
  ON public.ai_workers FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      organization_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.organization_id = ai_workers.organization_id
          AND om.user_id = auth.uid()
          AND om.joined_at IS NOT NULL
          AND om.role IN ('owner', 'admin', 'member')
      )
    )
  );

DROP POLICY IF EXISTS "creators or org admins update workers" ON public.ai_workers;
CREATE POLICY "creators or org admins update workers"
  ON public.ai_workers FOR UPDATE TO authenticated
  USING (
    (organization_id IS NULL AND created_by = auth.uid())
    OR (
      organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.organization_id = ai_workers.organization_id
          AND om.user_id = auth.uid()
          AND om.joined_at IS NOT NULL
          AND (om.role IN ('owner', 'admin') OR ai_workers.created_by = auth.uid())
      )
    )
  )
  WITH CHECK (
    (organization_id IS NULL AND created_by = auth.uid())
    OR (
      organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.organization_id = ai_workers.organization_id
          AND om.user_id = auth.uid()
          AND om.joined_at IS NOT NULL
          AND (om.role IN ('owner', 'admin') OR ai_workers.created_by = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "creators or org admins delete workers" ON public.ai_workers;
CREATE POLICY "creators or org admins delete workers"
  ON public.ai_workers FOR DELETE TO authenticated
  USING (
    (created_by = auth.uid() AND organization_id IS NULL)
    OR (
      organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.organization_id = ai_workers.organization_id
          AND om.user_id = auth.uid()
          AND om.joined_at IS NOT NULL
          AND om.role IN ('owner', 'admin')
      )
    )
  );

-- Execution records are server-managed so browser clients cannot mark work done,
-- change outputs, or bypass approvals by writing task status directly.
CREATE TABLE IF NOT EXISTS public.ai_worker_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES public.ai_workers(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  goal text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'waiting_approval', 'done', 'blocked', 'failed', 'cancelled')),
  input_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_json jsonb,
  error_text text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  checkpoint_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_worker_tasks_creator_updated
  ON public.ai_worker_tasks(created_by, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_worker_tasks_worker_status
  ON public.ai_worker_tasks(worker_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_worker_tasks_queue
  ON public.ai_worker_tasks(status, created_at)
  WHERE status IN ('queued', 'waiting_approval');

ALTER TABLE public.ai_worker_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "worker tasks visible to creator or joined org members" ON public.ai_worker_tasks;
CREATE POLICY "worker tasks visible through worker access"
  ON public.ai_worker_tasks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.ai_workers w
      WHERE w.id = ai_worker_tasks.worker_id
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

-- No INSERT/UPDATE/DELETE policies on ai_worker_tasks by design.
-- Trusted service-role Edge Functions own state transitions and outputs.

-- Explicit API grants are still required even when RLS policies exist.
-- No anon grants are made; RLS controls which authenticated rows are visible.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_workers TO authenticated;
GRANT SELECT ON public.ai_worker_tasks TO authenticated;
GRANT ALL ON public.ai_workers, public.ai_worker_tasks TO service_role;

COMMENT ON TABLE public.ai_workers IS
  'Persistent general-purpose AI Worker definitions; distinct from customer-facing receptionists.';
COMMENT ON COLUMN public.ai_workers.definition IS
  'Versioned worker contract: responsibilities, inputs/outputs, capabilities, permissions, autonomy and verification rules.';
COMMENT ON TABLE public.ai_worker_tasks IS
  'Durable task records for general-purpose AI Workers; writes are server-managed.';
COMMENT ON COLUMN public.ai_worker_tasks.checkpoint_json IS
  'Bounded resumable execution checkpoint. Never store credentials or unredacted secrets here.';
