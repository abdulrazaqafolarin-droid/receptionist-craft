-- Lease-based execution primitives for the future trusted worker runner.
-- These database functions do not execute a model or external capability. They
-- provide atomic claims, heartbeat, evidence-gated completion and safe recovery.

ALTER TABLE public.ai_worker_tasks
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS worker_version integer,
  ADD COLUMN IF NOT EXISTS execution_attempt_id uuid;

ALTER TABLE public.ai_worker_tasks
  ADD CONSTRAINT ai_worker_tasks_worker_version_positive
  CHECK (worker_version IS NULL OR worker_version >= 1);

CREATE INDEX IF NOT EXISTS idx_ai_worker_tasks_expired_leases
  ON public.ai_worker_tasks(lease_expires_at)
  WHERE status = 'running' AND lease_expires_at IS NOT NULL;

-- Lease tokens and execution internals are not readable by browser roles.
-- Clients keep read access to the task fields needed for history and workspace UI.
REVOKE ALL ON public.ai_worker_tasks FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, worker_id, created_by, title, goal, status, input_json, output_json,
  error_text, attempt_count, checkpoint_json, started_at, finished_at,
  created_at, updated_at, idempotency_key, approval_request, approved_by,
  approved_at, cancel_requested_at
) ON public.ai_worker_tasks TO authenticated;

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

  SELECT * INTO v_worker
  FROM public.ai_workers
  WHERE id = p_worker_id AND status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'worker_not_active');
  END IF;

  SELECT t.* INTO v_task
  FROM public.ai_worker_tasks t
  WHERE t.worker_id = p_worker_id
    AND t.status = 'queued'
    AND t.cancel_requested_at IS NULL
  ORDER BY t.created_at ASC
  LIMIT 1
  FOR UPDATE OF t SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'task', NULL, 'empty', true);
  END IF;

  UPDATE public.ai_worker_tasks
  SET status = 'running',
      attempt_count = attempt_count + 1,
      worker_version = v_worker.version,
      execution_attempt_id = gen_random_uuid(),
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      heartbeat_at = now(),
      started_at = COALESCE(started_at, now()),
      updated_at = now()
  WHERE id = v_task.id
  RETURNING * INTO v_task;

  INSERT INTO public.ai_worker_task_events(task_id, event_type, from_status, to_status, details)
  VALUES (v_task.id, 'status_changed', 'queued', 'running',
    jsonb_build_object(
      'attempt_count', v_task.attempt_count,
      'worker_version', v_worker.version,
      'execution_attempt_id', v_task.execution_attempt_id
    ));

  RETURN jsonb_build_object('ok', true, 'empty', false, 'task', to_jsonb(v_task));
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_ai_worker_task(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_worker_task(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.heartbeat_ai_worker_task(
  p_task_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_task public.ai_worker_tasks%ROWTYPE;
BEGIN
  IF p_task_id IS NULL OR p_lease_token IS NULL OR p_lease_seconds IS NULL
     OR p_lease_seconds NOT BETWEEN 15 AND 300 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_lease_request');
  END IF;

  SELECT * INTO v_task FROM public.ai_worker_tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND OR v_task.status <> 'running' OR v_task.lease_token IS DISTINCT FROM p_lease_token THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lease_not_owned');
  END IF;
  IF v_task.lease_expires_at IS NULL OR v_task.lease_expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lease_expired');
  END IF;
  IF v_task.cancel_requested_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cancellation_requested');
  END IF;

  UPDATE public.ai_worker_tasks
  SET heartbeat_at = now(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      updated_at = now()
  WHERE id = p_task_id
  RETURNING * INTO v_task;

  RETURN jsonb_build_object('ok', true, 'task_id', v_task.id, 'lease_expires_at', v_task.lease_expires_at);
END;
$function$;

REVOKE ALL ON FUNCTION public.heartbeat_ai_worker_task(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_ai_worker_task(uuid, uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_ai_worker_task(
  p_task_id uuid,
  p_lease_token uuid,
  p_outcome text,
  p_output jsonb DEFAULT NULL,
  p_evidence jsonb DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_task public.ai_worker_tasks%ROWTYPE;
  v_evidence_item jsonb;
  v_kind text;
  v_summary text;
  v_reference text;
  v_event text;
BEGIN
  IF p_task_id IS NULL OR p_lease_token IS NULL
     OR p_outcome IS NULL OR p_outcome NOT IN ('done', 'blocked', 'failed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_finish_request');
  END IF;
  IF p_output IS NOT NULL AND pg_column_size(p_output) > 65536 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'output_too_large');
  END IF;

  SELECT * INTO v_task FROM public.ai_worker_tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND OR v_task.status <> 'running' OR v_task.lease_token IS DISTINCT FROM p_lease_token THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lease_not_owned');
  END IF;
  IF v_task.lease_expires_at IS NULL OR v_task.lease_expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lease_expired');
  END IF;

  IF p_outcome = 'done' THEN
    IF v_task.cancel_requested_at IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'cancellation_requested');
    END IF;
    IF p_evidence IS NULL
       OR jsonb_typeof(p_evidence) <> 'array'
       OR jsonb_array_length(p_evidence) < 1
       OR jsonb_array_length(p_evidence) > 20
       OR pg_column_size(p_evidence) > 32768 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'completion_evidence_required');
    END IF;
    FOR v_evidence_item IN SELECT value FROM jsonb_array_elements(p_evidence)
    LOOP
      v_kind := v_evidence_item ->> 'kind';
      v_summary := v_evidence_item ->> 'summary';
      v_reference := v_evidence_item ->> 'reference';
      IF jsonb_typeof(v_evidence_item) <> 'object'
         OR v_kind IS NULL
         OR v_kind NOT IN ('source', 'action_receipt', 'verification')
         OR v_summary IS NULL OR length(btrim(v_summary)) NOT BETWEEN 1 AND 1000
         OR v_reference IS NULL OR length(btrim(v_reference)) NOT BETWEEN 1 AND 500 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'invalid_completion_evidence');
      END IF;
    END LOOP;
    v_event := 'verification_recorded';
  ELSIF p_outcome = 'cancelled' THEN
    IF v_task.cancel_requested_at IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'cancellation_not_requested');
    END IF;
    v_event := 'status_changed';
  ELSE
    IF p_error IS NULL OR length(btrim(p_error)) NOT BETWEEN 1 AND 1000 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'failure_reason_required');
    END IF;
    v_event := 'status_changed';
  END IF;

  UPDATE public.ai_worker_tasks
  SET status = p_outcome,
      output_json = CASE WHEN p_outcome = 'done' THEN p_output ELSE output_json END,
      error_text = CASE WHEN p_outcome IN ('failed', 'blocked') THEN btrim(p_error) ELSE NULL END,
      checkpoint_json = CASE WHEN p_outcome = 'done'
        THEN COALESCE(checkpoint_json, '{}'::jsonb) || jsonb_build_object('completion_evidence', p_evidence)
        ELSE checkpoint_json END,
      finished_at = now(),
      lease_token = NULL,
      lease_expires_at = NULL,
      heartbeat_at = now(),
      updated_at = now()
  WHERE id = p_task_id
  RETURNING * INTO v_task;

  INSERT INTO public.ai_worker_task_events(task_id, event_type, from_status, to_status, details)
  VALUES (v_task.id, v_event, 'running', p_outcome,
    jsonb_build_object(
      'execution_attempt_id', v_task.execution_attempt_id,
      'evidence_count', CASE WHEN p_outcome = 'done' THEN jsonb_array_length(p_evidence) ELSE 0 END,
      'reason', CASE WHEN p_outcome IN ('failed', 'blocked') THEN left(btrim(p_error), 200) ELSE NULL END
    ));

  RETURN jsonb_build_object('ok', true, 'task', to_jsonb(v_task));
END;
$function$;

REVOKE ALL ON FUNCTION public.finish_ai_worker_task(uuid, uuid, text, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_ai_worker_task(uuid, uuid, text, jsonb, jsonb, text) TO service_role;

-- An expired lease means the external outcome may be unknown. Never requeue
-- it automatically: block it for reconciliation so side effects are not duplicated.
CREATE OR REPLACE FUNCTION public.block_expired_ai_worker_tasks(p_limit integer DEFAULT 50)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_task public.ai_worker_tasks%ROWTYPE;
  v_count integer := 0;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid_limit' USING ERRCODE = '22023';
  END IF;

  FOR v_task IN
    SELECT * FROM public.ai_worker_tasks
    WHERE status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at <= now()
    ORDER BY lease_expires_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.ai_worker_tasks
    SET status = 'blocked',
        error_text = 'lease_expired_unknown_outcome: reconcile before retry',
        lease_token = NULL,
        lease_expires_at = NULL,
        heartbeat_at = now(),
        updated_at = now()
    WHERE id = v_task.id;

    INSERT INTO public.ai_worker_task_events(task_id, event_type, from_status, to_status, details)
    VALUES (v_task.id, 'status_changed', 'running', 'blocked',
      jsonb_build_object('reason', 'lease_expired_unknown_outcome', 'execution_attempt_id', v_task.execution_attempt_id));
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.block_expired_ai_worker_tasks(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.block_expired_ai_worker_tasks(integer) TO service_role;

COMMENT ON COLUMN public.ai_worker_tasks.lease_token IS
  'Secret per-claim token; returned only to the trusted runner and cleared on finish/recovery.';
COMMENT ON COLUMN public.ai_worker_tasks.worker_version IS
  'Immutable worker definition version pinned at task claim.';
COMMENT ON COLUMN public.ai_worker_tasks.execution_attempt_id IS
  'Unique attempt identifier for receipts, logs and idempotency correlation.';
