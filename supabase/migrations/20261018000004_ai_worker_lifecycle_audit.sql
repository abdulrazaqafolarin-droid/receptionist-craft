-- Atomic lifecycle mutations and append-only audit events for worker definitions.
-- These RPCs are service-role only; the Edge Function must authenticate the actor
-- and validate the worker contract before calling them. Authorization is checked
-- again here to keep tenant/role boundaries inside the transaction.

ALTER TABLE public.ai_worker_lifecycle_events
  DROP CONSTRAINT IF EXISTS ai_worker_lifecycle_events_event_type_check;
ALTER TABLE public.ai_worker_lifecycle_events
  DROP CONSTRAINT IF EXISTS ai_worker_lifecycle_events_from_status_check;
ALTER TABLE public.ai_worker_lifecycle_events
  DROP CONSTRAINT IF EXISTS ai_worker_lifecycle_events_to_status_check;

ALTER TABLE public.ai_worker_lifecycle_events
  ADD CONSTRAINT ai_worker_lifecycle_events_event_type_check
  CHECK (event_type IN (
    'worker_created', 'worker_draft_updated', 'worker_archived',
    'worker_verification_started', 'worker_verification_passed', 'worker_verification_failed',
    'worker_published', 'worker_paused', 'worker_resumed'
  ));
ALTER TABLE public.ai_worker_lifecycle_events
  ADD CONSTRAINT ai_worker_lifecycle_events_from_status_check
  CHECK (from_status IN ('draft', 'building', 'testing', 'active', 'paused', 'archived'));
ALTER TABLE public.ai_worker_lifecycle_events
  ADD CONSTRAINT ai_worker_lifecycle_events_to_status_check
  CHECK (to_status IN ('draft', 'building', 'testing', 'active', 'paused', 'archived'));

CREATE OR REPLACE FUNCTION public.create_ai_worker_draft(
  p_actor_id uuid,
  p_organization_id uuid,
  p_name text,
  p_description text,
  p_definition jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_worker public.ai_workers%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL
     OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120
     OR p_description IS NULL OR length(p_description) > 2000
     OR p_definition IS NULL OR jsonb_typeof(p_definition) <> 'object'
     OR pg_column_size(p_definition) > 32768 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_worker_draft');
  END IF;

  IF p_organization_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = p_actor_id
      AND om.joined_at IS NOT NULL
      AND om.role IN ('owner', 'admin', 'member')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'organization_access_denied');
  END IF;

  INSERT INTO public.ai_workers (
    organization_id, created_by, name, description, status, version, definition
  ) VALUES (
    p_organization_id, p_actor_id, btrim(p_name), btrim(p_description), 'draft', 1, p_definition
  ) RETURNING * INTO v_worker;

  INSERT INTO public.ai_worker_lifecycle_events (
    worker_id, actor_id, event_type, from_status, to_status, details
  ) VALUES (
    v_worker.id, p_actor_id, 'worker_created', 'draft', 'draft',
    jsonb_build_object('version', v_worker.version, 'scope', CASE WHEN p_organization_id IS NULL THEN 'personal' ELSE 'organization' END)
  );

  RETURN jsonb_build_object('ok', true, 'worker', to_jsonb(v_worker));
END;
$function$;

REVOKE ALL ON FUNCTION public.create_ai_worker_draft(uuid, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_ai_worker_draft(uuid, uuid, text, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.update_ai_worker_draft(
  p_actor_id uuid,
  p_worker_id uuid,
  p_expected_version integer,
  p_name text,
  p_description text,
  p_definition jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_worker public.ai_workers%ROWTYPE;
  v_allowed boolean := false;
BEGIN
  IF p_actor_id IS NULL OR p_worker_id IS NULL OR p_expected_version IS NULL
     OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120
     OR p_description IS NULL OR length(p_description) > 2000
     OR p_definition IS NULL OR jsonb_typeof(p_definition) <> 'object'
     OR pg_column_size(p_definition) > 32768 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_worker_draft');
  END IF;

  SELECT * INTO v_worker FROM public.ai_workers WHERE id = p_worker_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'worker_not_found'); END IF;
  IF v_worker.status <> 'draft' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'only_drafts_can_be_edited');
  END IF;
  IF v_worker.version <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'error', 'worker_changed_concurrently');
  END IF;

  IF v_worker.organization_id IS NULL THEN
    v_allowed := v_worker.created_by = p_actor_id;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = v_worker.organization_id
        AND om.user_id = p_actor_id
        AND om.joined_at IS NOT NULL
        AND (
          om.role IN ('owner', 'admin')
          OR (om.role = 'member' AND v_worker.created_by = p_actor_id)
        )
    ) INTO v_allowed;
  END IF;
  IF NOT v_allowed THEN RETURN jsonb_build_object('ok', false, 'error', 'worker_access_denied'); END IF;

  UPDATE public.ai_workers
  SET name = btrim(p_name),
      description = btrim(p_description),
      definition = p_definition,
      version = version + 1,
      updated_at = now()
  WHERE id = v_worker.id
  RETURNING * INTO v_worker;

  INSERT INTO public.ai_worker_lifecycle_events (
    worker_id, actor_id, event_type, from_status, to_status, details
  ) VALUES (
    v_worker.id, p_actor_id, 'worker_draft_updated', 'draft', 'draft',
    jsonb_build_object('version', v_worker.version)
  );

  RETURN jsonb_build_object('ok', true, 'worker', to_jsonb(v_worker));
END;
$function$;

REVOKE ALL ON FUNCTION public.update_ai_worker_draft(uuid, uuid, integer, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_ai_worker_draft(uuid, uuid, integer, text, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.archive_ai_worker(
  p_actor_id uuid,
  p_worker_id uuid,
  p_expected_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_worker public.ai_workers%ROWTYPE;
  v_allowed boolean := false;
  v_previous_status text;
BEGIN
  IF p_actor_id IS NULL OR p_worker_id IS NULL OR p_expected_version IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_archive_request');
  END IF;

  SELECT * INTO v_worker FROM public.ai_workers WHERE id = p_worker_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'worker_not_found'); END IF;
  IF v_worker.status = 'archived' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'worker_already_archived');
  END IF;
  IF v_worker.version <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'error', 'worker_changed_concurrently');
  END IF;

  IF v_worker.organization_id IS NULL THEN
    v_allowed := v_worker.created_by = p_actor_id;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = v_worker.organization_id
        AND om.user_id = p_actor_id
        AND om.joined_at IS NOT NULL
        AND om.role IN ('owner', 'admin')
    ) INTO v_allowed;
  END IF;
  IF NOT v_allowed THEN RETURN jsonb_build_object('ok', false, 'error', 'worker_archive_denied'); END IF;

  IF EXISTS (
    SELECT 1 FROM public.ai_worker_tasks
    WHERE worker_id = v_worker.id AND status IN ('running', 'waiting_approval')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'active_tasks_must_be_resolved');
  END IF;

  v_previous_status := v_worker.status;
  UPDATE public.ai_workers
  SET status = 'archived', archived_at = now(), updated_at = now()
  WHERE id = v_worker.id
  RETURNING * INTO v_worker;

  INSERT INTO public.ai_worker_lifecycle_events (
    worker_id, actor_id, event_type, from_status, to_status, details
  ) VALUES (
    v_worker.id, p_actor_id, 'worker_archived', v_previous_status, 'archived',
    jsonb_build_object('version', v_worker.version)
  );

  RETURN jsonb_build_object('ok', true, 'worker', to_jsonb(v_worker));
END;
$function$;

REVOKE ALL ON FUNCTION public.archive_ai_worker(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_ai_worker(uuid, uuid, integer) TO service_role;


-- Verification-run creation/completion and their audit events are atomic. After
-- this migration, even service_role must use these RPCs rather than rewriting
-- verification history directly.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.ai_worker_verification_runs FROM service_role;
GRANT SELECT ON public.ai_worker_verification_runs TO service_role;

CREATE OR REPLACE FUNCTION public.start_ai_worker_verification(
  p_worker_id uuid,
  p_actor_id uuid,
  p_worker_version integer,
  p_definition_hash text,
  p_definition_snapshot jsonb,
  p_model text DEFAULT 'gemini-2.5-flash-lite'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_worker public.ai_workers%ROWTYPE;
  v_run public.ai_worker_verification_runs%ROWTYPE;
  v_allowed boolean := false;
BEGIN
  IF p_worker_id IS NULL OR p_actor_id IS NULL OR p_worker_version IS NULL
     OR p_worker_version < 1
     OR p_definition_hash IS NULL OR p_definition_hash !~ '^[0-9a-f]{64}$'
     OR p_definition_snapshot IS NULL OR jsonb_typeof(p_definition_snapshot) <> 'object'
     OR pg_column_size(p_definition_snapshot) > 32768
     OR p_model IS NULL OR length(btrim(p_model)) NOT BETWEEN 1 AND 100 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_verification_request');
  END IF;

  SELECT * INTO v_worker FROM public.ai_workers WHERE id = p_worker_id FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'worker_not_found'); END IF;
  IF v_worker.status <> 'draft' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'only_drafts_can_be_verified');
  END IF;
  IF v_worker.version <> p_worker_version OR v_worker.definition <> p_definition_snapshot THEN
    RETURN jsonb_build_object('ok', false, 'error', 'worker_changed_concurrently');
  END IF;

  IF v_worker.organization_id IS NULL THEN
    v_allowed := v_worker.created_by = p_actor_id;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = v_worker.organization_id
        AND om.user_id = p_actor_id
        AND om.joined_at IS NOT NULL
        AND (
          om.role IN ('owner', 'admin')
          OR (om.role = 'member' AND v_worker.created_by = p_actor_id)
        )
    ) INTO v_allowed;
  END IF;
  IF NOT v_allowed THEN RETURN jsonb_build_object('ok', false, 'error', 'worker_access_denied'); END IF;

  INSERT INTO public.ai_worker_verification_runs (
    worker_id, actor_id, worker_version, definition_hash, definition_snapshot,
    status, model, tests, summary
  ) VALUES (
    v_worker.id, p_actor_id, v_worker.version, p_definition_hash, v_worker.definition,
    'running', btrim(p_model), '[]'::jsonb, 'Verification is running.'
  ) RETURNING * INTO v_run;

  INSERT INTO public.ai_worker_lifecycle_events (
    worker_id, actor_id, event_type, from_status, to_status, details
  ) VALUES (
    v_worker.id, p_actor_id, 'worker_verification_started', 'draft', 'draft',
    jsonb_build_object('version', v_worker.version, 'verification_run_id', v_run.id, 'definition_hash', v_run.definition_hash)
  );

  RETURN jsonb_build_object('ok', true, 'verification', to_jsonb(v_run));
END;
$function$;

REVOKE ALL ON FUNCTION public.start_ai_worker_verification(uuid, uuid, integer, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_ai_worker_verification(uuid, uuid, integer, text, jsonb, text) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_ai_worker_verification(
  p_run_id uuid,
  p_actor_id uuid,
  p_status text,
  p_tests jsonb,
  p_summary text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_run public.ai_worker_verification_runs%ROWTYPE;
  v_event text;
BEGIN
  IF p_run_id IS NULL OR p_actor_id IS NULL
     OR p_status IS NULL OR p_status NOT IN ('passed', 'failed')
     OR p_tests IS NULL OR jsonb_typeof(p_tests) <> 'array'
     OR jsonb_array_length(p_tests) NOT BETWEEN 1 AND 20
     OR pg_column_size(p_tests) > 65536
     OR p_summary IS NULL OR length(btrim(p_summary)) NOT BETWEEN 1 AND 1000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_verification_result');
  END IF;

  SELECT * INTO v_run FROM public.ai_worker_verification_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'verification_run_not_found'); END IF;
  IF v_run.actor_id IS DISTINCT FROM p_actor_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'verification_actor_mismatch');
  END IF;
  IF v_run.status <> 'running' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'verification_run_terminal');
  END IF;

  UPDATE public.ai_worker_verification_runs
  SET status = p_status, tests = p_tests, summary = btrim(p_summary), completed_at = now()
  WHERE id = v_run.id
  RETURNING * INTO v_run;

  v_event := CASE WHEN p_status = 'passed'
    THEN 'worker_verification_passed' ELSE 'worker_verification_failed' END;
  INSERT INTO public.ai_worker_lifecycle_events (
    worker_id, actor_id, event_type, from_status, to_status, details
  ) VALUES (
    v_run.worker_id, p_actor_id, v_event, 'draft', 'draft',
    jsonb_build_object('version', v_run.worker_version, 'verification_run_id', v_run.id,
      'definition_hash', v_run.definition_hash, 'test_count', jsonb_array_length(v_run.tests))
  );

  RETURN jsonb_build_object('ok', true, 'verification', to_jsonb(v_run));
END;
$function$;

REVOKE ALL ON FUNCTION public.finish_ai_worker_verification(uuid, uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_ai_worker_verification(uuid, uuid, text, jsonb, text) TO service_role;
