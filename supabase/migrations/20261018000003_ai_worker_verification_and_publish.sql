-- Draft-only worker verification, controlled publication and verified-version gating.
-- This migration does not enable external capabilities; it publishes only the
-- supervised, no-capability worker subset supported by worker-runner.

CREATE TABLE IF NOT EXISTS public.ai_worker_verification_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES public.ai_workers(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  worker_version integer NOT NULL CHECK (worker_version > 0),
  definition_hash text NOT NULL CHECK (definition_hash ~ '^[0-9a-f]{64}$'),
  definition_snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'passed', 'failed')),
  model text NOT NULL DEFAULT 'gemini-2.5-flash-lite',
  tests jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ai_worker_verification_runs_latest
  ON public.ai_worker_verification_runs(worker_id, created_at DESC);

ALTER TABLE public.ai_workers
  ADD COLUMN IF NOT EXISTS verified_version integer,
  ADD COLUMN IF NOT EXISTS verification_run_id uuid
    REFERENCES public.ai_worker_verification_runs(id) ON DELETE SET NULL;

ALTER TABLE public.ai_workers
  ADD CONSTRAINT ai_workers_verified_version_positive
  CHECK (verified_version IS NULL OR verified_version > 0);

CREATE TABLE IF NOT EXISTS public.ai_worker_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES public.ai_workers(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'worker_published', 'worker_paused', 'worker_resumed'
  )),
  from_status text NOT NULL CHECK (from_status IN ('draft', 'active', 'paused')),
  to_status text NOT NULL CHECK (to_status IN ('active', 'paused')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_worker_lifecycle_events_worker_created
  ON public.ai_worker_lifecycle_events(worker_id, created_at DESC);

ALTER TABLE public.ai_worker_verification_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_worker_lifecycle_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "worker verification runs visible through worker access" ON public.ai_worker_verification_runs;
CREATE POLICY "worker verification runs visible through worker access"
  ON public.ai_worker_verification_runs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_workers w
      WHERE w.id = ai_worker_verification_runs.worker_id
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

DROP POLICY IF EXISTS "worker lifecycle events visible through worker access" ON public.ai_worker_lifecycle_events;
CREATE POLICY "worker lifecycle events visible through worker access"
  ON public.ai_worker_lifecycle_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_workers w
      WHERE w.id = ai_worker_lifecycle_events.worker_id
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

REVOKE ALL ON public.ai_worker_verification_runs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.ai_worker_verification_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ai_worker_verification_runs TO service_role;

REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.ai_worker_verification_runs FROM service_role;

REVOKE ALL ON public.ai_worker_lifecycle_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.ai_worker_lifecycle_events TO authenticated;
GRANT SELECT, INSERT ON public.ai_worker_lifecycle_events TO service_role;

CREATE OR REPLACE FUNCTION public.publish_ai_worker(
  p_worker_id uuid,
  p_actor_id uuid,
  p_verification_run_id uuid,
  p_expected_status text DEFAULT 'draft'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_worker public.ai_workers%ROWTYPE;
  v_run public.ai_worker_verification_runs%ROWTYPE;
  v_event text;
BEGIN
  IF p_actor_id IS NULL OR p_worker_id IS NULL OR p_verification_run_id IS NULL
     OR p_expected_status IS NULL OR p_expected_status NOT IN ('draft', 'paused') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_publish_request');
  END IF;

  SELECT * INTO v_worker FROM public.ai_workers WHERE id = p_worker_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'worker_not_found');
  END IF;
  IF v_worker.status <> p_expected_status THEN
    RETURN jsonb_build_object('ok', false, 'error', 'worker_status_changed');
  END IF;

  SELECT * INTO v_run FROM public.ai_worker_verification_runs
  WHERE id = p_verification_run_id AND worker_id = p_worker_id
  FOR SHARE;
  IF NOT FOUND OR v_run.status <> 'passed'
     OR v_run.worker_version <> v_worker.version
     OR v_run.definition_snapshot <> v_worker.definition THEN
    RETURN jsonb_build_object('ok', false, 'error', 'current_verification_required');
  END IF;

  IF v_worker.definition ->> 'autonomy_mode' <> 'supervised'
     OR jsonb_typeof(v_worker.definition -> 'allowed_actions') <> 'array'
     OR NOT ((v_worker.definition -> 'allowed_actions') ? 'draft')
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements_text(v_worker.definition -> 'allowed_actions') AS action(value)
       WHERE action.value NOT IN ('research', 'internal_read', 'draft')
     )
     OR jsonb_typeof(v_worker.definition -> 'capability_keys') <> 'array'
     OR jsonb_array_length(v_worker.definition -> 'capability_keys') <> 0
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_worker.definition -> 'outputs') AS output(value)
       WHERE output.value ->> 'type' = 'file'
     )
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_worker.definition -> 'inputs') AS input(value)
       WHERE input.value ->> 'type' = 'file' AND COALESCE((input.value ->> 'required')::boolean, false)
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'worker_not_supported_by_draft_runner');
  END IF;

  v_event := CASE WHEN p_expected_status = 'draft' THEN 'worker_published' ELSE 'worker_resumed' END;
  UPDATE public.ai_workers
  SET status = 'active',
      verified_version = version,
      verification_run_id = v_run.id,
      published_at = COALESCE(published_at, now()),
      updated_at = now()
  WHERE id = p_worker_id
  RETURNING * INTO v_worker;

  INSERT INTO public.ai_worker_lifecycle_events(worker_id, actor_id, event_type, from_status, to_status, details)
  VALUES (v_worker.id, p_actor_id, v_event, p_expected_status, 'active',
    jsonb_build_object('version', v_worker.version, 'verification_run_id', v_run.id, 'definition_hash', v_run.definition_hash));

  RETURN jsonb_build_object('ok', true, 'worker', to_jsonb(v_worker));
END;
$function$;

REVOKE ALL ON FUNCTION public.publish_ai_worker(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_ai_worker(uuid, uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.pause_ai_worker(p_worker_id uuid, p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_worker public.ai_workers%ROWTYPE;
BEGIN
  IF p_worker_id IS NULL OR p_actor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_pause_request');
  END IF;
  SELECT * INTO v_worker FROM public.ai_workers WHERE id = p_worker_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'worker_not_found'); END IF;
  IF v_worker.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'worker_not_active');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ai_worker_tasks
    WHERE worker_id = p_worker_id AND status IN ('running', 'waiting_approval')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'active_tasks_must_be_resolved');
  END IF;

  UPDATE public.ai_workers SET status = 'paused', updated_at = now()
  WHERE id = p_worker_id RETURNING * INTO v_worker;
  INSERT INTO public.ai_worker_lifecycle_events(worker_id, actor_id, event_type, from_status, to_status, details)
  VALUES (v_worker.id, p_actor_id, 'worker_paused', 'active', 'paused',
    jsonb_build_object('version', v_worker.version));
  RETURN jsonb_build_object('ok', true, 'worker', to_jsonb(v_worker));
END;
$function$;

REVOKE ALL ON FUNCTION public.pause_ai_worker(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pause_ai_worker(uuid, uuid) TO service_role;

-- Replace the task creation RPC so an accidentally/manual-active worker cannot
-- enqueue work without a matching passed verification of the current definition.
CREATE OR REPLACE FUNCTION public.create_ai_worker_task(
  p_worker_id uuid,
  p_actor_id uuid,
  p_title text,
  p_goal text,
  p_input jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_worker public.ai_workers%ROWTYPE;
  v_task public.ai_worker_tasks%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL
     OR p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 200
     OR p_goal IS NULL OR length(btrim(p_goal)) NOT BETWEEN 1 AND 4000
     OR p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 8 AND 128
     OR p_input IS NULL OR jsonb_typeof(p_input) <> 'object'
     OR pg_column_size(p_input) > 32768 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_task_input');
  END IF;

  SELECT * INTO v_worker FROM public.ai_workers WHERE id = p_worker_id FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'worker_not_found'); END IF;
  IF v_worker.status <> 'active' THEN RETURN jsonb_build_object('ok', false, 'error', 'worker_not_active'); END IF;
  IF v_worker.verified_version IS DISTINCT FROM v_worker.version OR v_worker.verification_run_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.ai_worker_verification_runs vr
       WHERE vr.id = v_worker.verification_run_id
         AND vr.worker_id = v_worker.id
         AND vr.status = 'passed'
         AND vr.worker_version = v_worker.version
         AND vr.definition_snapshot = v_worker.definition
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'worker_not_verified');
  END IF;

  INSERT INTO public.ai_worker_tasks (
    worker_id, created_by, title, goal, input_json, idempotency_key, status
  ) VALUES (
    p_worker_id, p_actor_id, btrim(p_title), btrim(p_goal), p_input, p_idempotency_key, 'queued'
  )
  ON CONFLICT (worker_id, created_by, idempotency_key)
    WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING * INTO v_task;

  IF NOT FOUND THEN
    SELECT * INTO v_task FROM public.ai_worker_tasks
    WHERE worker_id = p_worker_id AND created_by = p_actor_id AND idempotency_key = p_idempotency_key
    FOR UPDATE;
    IF v_task.title <> btrim(p_title) OR v_task.goal <> btrim(p_goal) OR v_task.input_json <> p_input THEN
      RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
    END IF;
    RETURN jsonb_build_object('ok', true, 'replayed', true, 'task', to_jsonb(v_task));
  END IF;

  INSERT INTO public.ai_worker_task_events(task_id, actor_id, event_type, from_status, to_status, details)
  VALUES (v_task.id, p_actor_id, 'task_created', NULL, 'queued',
    jsonb_build_object('worker_version', v_worker.version, 'idempotency_key', p_idempotency_key));
  RETURN jsonb_build_object('ok', true, 'replayed', false, 'task', to_jsonb(v_task));
END;
$function$;

REVOKE ALL ON FUNCTION public.create_ai_worker_task(uuid, uuid, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_ai_worker_task(uuid, uuid, text, text, jsonb, text) TO service_role;

-- Require a current passed verification for every claim. Keep the existing
-- signature so the queue API and existing callers remain compatible.
CREATE OR REPLACE FUNCTION public.claim_ai_worker_task(
  p_worker_id uuid,
  p_lease_seconds integer DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_task public.ai_worker_tasks%ROWTYPE;
  v_worker public.ai_workers%ROWTYPE;
BEGIN
  IF p_worker_id IS NULL OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 15 AND 300 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_lease_request');
  END IF;
  SELECT * INTO v_worker FROM public.ai_workers WHERE id = p_worker_id FOR SHARE;
  IF NOT FOUND OR v_worker.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'worker_not_active');
  END IF;
  IF v_worker.verified_version IS DISTINCT FROM v_worker.version OR v_worker.verification_run_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.ai_worker_verification_runs vr
       WHERE vr.id = v_worker.verification_run_id
         AND vr.worker_id = v_worker.id AND vr.status = 'passed'
         AND vr.worker_version = v_worker.version
         AND vr.definition_snapshot = v_worker.definition
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'worker_not_verified');
  END IF;

  SELECT t.* INTO v_task FROM public.ai_worker_tasks t
  WHERE t.worker_id = p_worker_id AND t.status = 'queued' AND t.cancel_requested_at IS NULL
  ORDER BY t.created_at ASC LIMIT 1 FOR UPDATE OF t SKIP LOCKED;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', true, 'task', NULL, 'empty', true); END IF;

  UPDATE public.ai_worker_tasks
  SET status = 'running', attempt_count = attempt_count + 1,
      worker_version = v_worker.version, execution_attempt_id = gen_random_uuid(),
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      heartbeat_at = now(), started_at = COALESCE(started_at, now()), updated_at = now()
  WHERE id = v_task.id RETURNING * INTO v_task;

  INSERT INTO public.ai_worker_task_events(task_id, event_type, from_status, to_status, details)
  VALUES (v_task.id, 'status_changed', 'queued', 'running',
    jsonb_build_object('attempt_count', v_task.attempt_count, 'worker_version', v_worker.version,
      'execution_attempt_id', v_task.execution_attempt_id));
  RETURN jsonb_build_object('ok', true, 'empty', false, 'task', to_jsonb(v_task));
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_ai_worker_task(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_worker_task(uuid, integer) TO service_role;

-- Task-specific claim used by the interactive workspace to avoid executing a
-- different older task than the one the owner just requested to run.
CREATE OR REPLACE FUNCTION public.claim_ai_worker_task_for_task(
  p_worker_id uuid,
  p_task_id uuid,
  p_lease_seconds integer DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_task public.ai_worker_tasks%ROWTYPE;
  v_worker public.ai_workers%ROWTYPE;
BEGIN
  IF p_worker_id IS NULL OR p_task_id IS NULL OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 15 AND 300 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_lease_request');
  END IF;
  SELECT * INTO v_worker FROM public.ai_workers WHERE id = p_worker_id FOR SHARE;
  IF NOT FOUND OR v_worker.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'worker_not_active');
  END IF;
  IF v_worker.verified_version IS DISTINCT FROM v_worker.version OR v_worker.verification_run_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.ai_worker_verification_runs vr
       WHERE vr.id = v_worker.verification_run_id
         AND vr.worker_id = v_worker.id AND vr.status = 'passed'
         AND vr.worker_version = v_worker.version
         AND vr.definition_snapshot = v_worker.definition
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'worker_not_verified');
  END IF;

  SELECT * INTO v_task FROM public.ai_worker_tasks
  WHERE id = p_task_id AND worker_id = p_worker_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'task_not_found'); END IF;
  IF v_task.status <> 'queued' OR v_task.cancel_requested_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'task_not_queued');
  END IF;

  UPDATE public.ai_worker_tasks
  SET status = 'running', attempt_count = attempt_count + 1,
      worker_version = v_worker.version, execution_attempt_id = gen_random_uuid(),
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      heartbeat_at = now(), started_at = COALESCE(started_at, now()), updated_at = now()
  WHERE id = v_task.id RETURNING * INTO v_task;

  INSERT INTO public.ai_worker_task_events(task_id, event_type, from_status, to_status, details)
  VALUES (v_task.id, 'status_changed', 'queued', 'running',
    jsonb_build_object('attempt_count', v_task.attempt_count, 'worker_version', v_worker.version,
      'execution_attempt_id', v_task.execution_attempt_id));
  RETURN jsonb_build_object('ok', true, 'empty', false, 'task', to_jsonb(v_task));
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_ai_worker_task_for_task(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_worker_task_for_task(uuid, uuid, integer) TO service_role;

COMMENT ON TABLE public.ai_worker_verification_runs IS
  'Version-pinned, source-free verification runs for worker definitions. Passing this check permits only the supervised draft-only runner.';
