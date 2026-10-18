-- Tighten publication to the exact capability set the current runner can execute.
-- A model-only draft runner has no research, internal-read, browser, or external
-- action adapters. A worker may not publish while declaring unsupported actions.
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
       WHERE action.value <> 'draft'
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

COMMENT ON FUNCTION public.publish_ai_worker(uuid, uuid, uuid, text) IS
  'Publishes only a current verified worker whose sole allowed action is draft, with no external capability keys; extend only alongside verified adapters and tests.';
