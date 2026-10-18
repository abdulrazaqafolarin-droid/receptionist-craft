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

-- Atomic task creation: task row and its audit event commit together.
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
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'worker_not_found');
  END IF;
  IF v_worker.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'worker_not_active');
  END IF;

  SELECT * INTO v_task
  FROM public.ai_worker_tasks
  WHERE worker_id = p_worker_id
    AND created_by = p_actor_id
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_task.title <> btrim(p_title)
       OR v_task.goal <> btrim(p_goal)
       OR v_task.input_json <> p_input THEN
      RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
    END IF;
    RETURN jsonb_build_object('ok', true, 'replayed', true, 'task', to_jsonb(v_task));
  END IF;

  INSERT INTO public.ai_worker_tasks (
    worker_id, created_by, title, goal, input_json, idempotency_key, status
  ) VALUES (
    p_worker_id, p_actor_id, btrim(p_title), btrim(p_goal), p_input, p_idempotency_key, 'queued'
  )
  RETURNING * INTO v_task;

  INSERT INTO public.ai_worker_task_events(task_id, actor_id, event_type, from_status, to_status, details)
  VALUES (v_task.id, p_actor_id, 'task_created', NULL, 'queued',
    jsonb_build_object('worker_version', v_worker.version, 'idempotency_key', p_idempotency_key));

  RETURN jsonb_build_object('ok', true, 'replayed', false, 'task', to_jsonb(v_task));
END;
$function$;

REVOKE ALL ON FUNCTION public.create_ai_worker_task(uuid, uuid, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_ai_worker_task(uuid, uuid, text, text, jsonb, text) TO service_role;

-- Atomic approval/cancellation transitions. A running task cannot be marked
-- cancelled until a future runner confirms that execution has stopped; for now
-- this records a cancellation request and leaves its state as running.
CREATE OR REPLACE FUNCTION public.transition_ai_worker_task(
  p_task_id uuid,
  p_actor_id uuid,
  p_action text,
  p_approval_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_task public.ai_worker_tasks%ROWTYPE;
  v_next_status text;
  v_event text;
  v_details jsonb := '{}'::jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_action NOT IN ('approve', 'cancel') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_transition');
  END IF;

  SELECT * INTO v_task FROM public.ai_worker_tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'task_not_found');
  END IF;

  IF p_action = 'approve' THEN
    IF v_task.status <> 'waiting_approval' OR v_task.approval_request IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'approval_not_pending');
    END IF;
    IF p_approval_id IS NULL
       OR p_approval_id <> v_task.approval_request ->> 'approval_id' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'approval_request_mismatch');
    END IF;

    v_next_status := 'queued';
    v_event := 'approval_granted';
    v_details := jsonb_build_object('approval_id', p_approval_id);
    UPDATE public.ai_worker_tasks
    SET status = v_next_status,
        approved_by = p_actor_id,
        approved_at = now(),
        checkpoint_json = COALESCE(checkpoint_json, '{}'::jsonb) ||
          jsonb_build_object('approval_receipt', jsonb_build_object(
            'approval_id', p_approval_id, 'approved_by', p_actor_id, 'approved_at', now()
          )),
        updated_at = now()
    WHERE id = p_task_id
    RETURNING * INTO v_task;
  ELSE
    IF v_task.status IN ('done', 'cancelled') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'task_terminal');
    ELSIF v_task.status = 'running' THEN
      UPDATE public.ai_worker_tasks
      SET cancel_requested_at = COALESCE(cancel_requested_at, now()), updated_at = now()
      WHERE id = p_task_id
      RETURNING * INTO v_task;
      v_next_status := 'running';
      v_event := 'cancel_requested';
    ELSE
      v_next_status := 'cancelled';
      v_event := 'cancelled';
      UPDATE public.ai_worker_tasks
      SET status = v_next_status, finished_at = now(), updated_at = now()
      WHERE id = p_task_id
      RETURNING * INTO v_task;
    END IF;
    v_details := jsonb_build_object('requested', true);
  END IF;

  INSERT INTO public.ai_worker_task_events(task_id, actor_id, event_type, from_status, to_status, details)
  VALUES (v_task.id, p_actor_id, v_event,
    CASE WHEN p_action = 'approve' THEN 'waiting_approval' ELSE
      CASE WHEN v_next_status = 'running' THEN 'running' ELSE NULL END END,
    v_next_status, v_details);

  RETURN jsonb_build_object('ok', true, 'task', to_jsonb(v_task));
END;
$function$;

REVOKE ALL ON FUNCTION public.transition_ai_worker_task(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_ai_worker_task(uuid, uuid, text, text) TO service_role;
