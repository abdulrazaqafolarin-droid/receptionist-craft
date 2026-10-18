-- Verification and publication gate regression tests.
DO $acl$
BEGIN
  IF has_function_privilege('anon', 'public.publish_ai_worker(uuid,uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.publish_ai_worker(uuid,uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.pause_ai_worker(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.pause_ai_worker(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'worker publication and pause RPCs must be service-role only';
  END IF;
  IF has_table_privilege('authenticated', 'public.ai_worker_verification_runs', 'INSERT')
     OR has_table_privilege('authenticated', 'public.ai_worker_verification_runs', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.ai_worker_verification_runs', 'DELETE') THEN
    RAISE EXCEPTION 'browser clients must not forge verification runs';
  END IF;
  IF has_table_privilege('service_role', 'public.ai_worker_verification_runs', 'DELETE') THEN
    RAISE EXCEPTION 'verification history must not be directly deleted by service_role';
  END IF;
END $acl$;

DO $publication$
DECLARE
  v_def jsonb := '{
    "schema_version": 1,
    "purpose": "Create a draft using supplied information only.",
    "responsibilities": ["Draft content", "Flag missing information"],
    "inputs": [{"key":"request","label":"Request","type":"text","required":true}],
    "outputs": [{"key":"result","label":"Draft result","type":"text","required":true}],
    "capability_keys": [],
    "allowed_actions": ["draft"],
    "approval_required_for": ["external_write","send_message","publish","purchase","payment","delete","permission_change","data_export"],
    "autonomy_mode": "supervised",
    "execution": {"max_steps":5,"timeout_seconds":90,"max_retries":0},
    "verification": {"success_criteria":["Return a useful draft"],"require_evidence":true},
    "workspace": {"layout":"task_board","panels":["tasks","outputs"]}
  }'::jsonb;
  v_unsafe jsonb;
  v_result jsonb;
  v_worker jsonb;
  v_run uuid;
  v_count integer;
BEGIN
  INSERT INTO public.ai_workers(id, organization_id, created_by, name, status, version, definition)
  VALUES ('23000000-0000-0000-0000-000000000001', NULL,
    '00000000-0000-0000-0000-000000000001', 'Publish gate worker', 'draft', 1, v_def);

  INSERT INTO public.ai_worker_verification_runs(
    id, worker_id, actor_id, worker_version, definition_hash, definition_snapshot, status, tests, summary, completed_at
  ) VALUES (
    '43000000-0000-0000-0000-000000000001',
    '23000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001', 1, repeat('e', 64), v_def,
    'failed', '[{"name":"sample_output_schema","passed":false}]'::jsonb, 'Failed verification', now()
  );

  v_result := public.publish_ai_worker(
    '23000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '43000000-0000-0000-0000-000000000001', 'draft'
  );
  IF v_result->>'error' <> 'current_verification_required' THEN
    RAISE EXCEPTION 'failed verification must not publish: %', v_result;
  END IF;

  INSERT INTO public.ai_worker_verification_runs(
    id, worker_id, actor_id, worker_version, definition_hash, definition_snapshot, status, tests, summary, completed_at
  ) VALUES (
    '43000000-0000-0000-0000-000000000002',
    '23000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001', 1, repeat('f', 64), v_def,
    'passed', '[{"name":"sample_output_schema","passed":true}]'::jsonb, 'Passed draft-only verification', now()
  );

  v_result := public.publish_ai_worker(
    '23000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '43000000-0000-0000-0000-000000000002', 'draft'
  );
  IF v_result->>'ok' <> 'true'
     OR v_result->'worker'->>'status' <> 'active'
     OR v_result->'worker'->>'verified_version' <> '1' THEN
    RAISE EXCEPTION 'matching passed verification should publish: %', v_result;
  END IF;

  v_result := public.pause_ai_worker(
    '23000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001'
  );
  IF v_result->>'ok' <> 'true' OR v_result->'worker'->>'status' <> 'paused' THEN
    RAISE EXCEPTION 'verified worker should pause cleanly: %', v_result;
  END IF;

  v_result := public.publish_ai_worker(
    '23000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '43000000-0000-0000-0000-000000000002', 'paused'
  );
  IF v_result->>'ok' <> 'true' OR v_result->'worker'->>'status' <> 'active' THEN
    RAISE EXCEPTION 'paused worker should resume with its current verification: %', v_result;
  END IF;

  INSERT INTO public.ai_worker_tasks(id, worker_id, created_by, title, goal, status)
  VALUES ('33000000-0000-0000-0000-000000000001',
    '23000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Running task', 'Block pause until this is resolved', 'running');
  v_result := public.pause_ai_worker(
    '23000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001'
  );
  IF v_result->>'error' <> 'active_tasks_must_be_resolved' THEN
    RAISE EXCEPTION 'pause must not strand active tasks';
  END IF;

  UPDATE public.ai_workers
  SET definition = definition || jsonb_build_object('purpose', 'Manually changed after verification')
  WHERE id = '23000000-0000-0000-0000-000000000001';
  v_result := public.create_ai_worker_task(
    '23000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Should not queue', 'Draft a short note', '{"execution_mode":"draft","payload":{"request":"hello"}}'::jsonb,
    'stale-version-key'
  );
  IF v_result->>'error' <> 'worker_not_verified' THEN
    RAISE EXCEPTION 'definition drift must invalidate task creation: %', v_result;
  END IF;

  v_unsafe := v_def || jsonb_build_object('allowed_actions', '["draft","send_message"]'::jsonb);
  INSERT INTO public.ai_workers(id, organization_id, created_by, name, status, version, definition)
  VALUES ('23000000-0000-0000-0000-000000000002', NULL,
    '00000000-0000-0000-0000-000000000001', 'Unsafe worker', 'draft', 1, v_unsafe);
  INSERT INTO public.ai_worker_verification_runs(
    id, worker_id, actor_id, worker_version, definition_hash, definition_snapshot, status, tests, summary, completed_at
  ) VALUES (
    '43000000-0000-0000-0000-000000000003',
    '23000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001', 1, repeat('1', 64), v_unsafe,
    'passed', '[]'::jsonb, 'Intentionally forged test fixture', now()
  );
  v_result := public.publish_ai_worker(
    '23000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    '43000000-0000-0000-0000-000000000003', 'draft'
  );
  IF v_result->>'error' <> 'worker_not_supported_by_draft_runner' THEN
    RAISE EXCEPTION 'database publication gate must reject consequential actions: %', v_result;
  END IF;

  SELECT count(*) INTO v_count FROM public.ai_worker_lifecycle_events
  WHERE worker_id = '23000000-0000-0000-0000-000000000001';
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'publish, pause and resume must each append lifecycle events';
  END IF;
END $publication$;
