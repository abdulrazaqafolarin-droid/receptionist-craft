-- Lease claim/heartbeat/finish/recovery regression tests on disposable PostgreSQL.
DO $acl$
BEGIN
  IF has_function_privilege('anon', 'public.claim_ai_worker_task(uuid,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.claim_ai_worker_task(uuid,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.heartbeat_ai_worker_task(uuid,uuid,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.heartbeat_ai_worker_task(uuid,uuid,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.finish_ai_worker_task(uuid,uuid,text,jsonb,jsonb,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.finish_ai_worker_task(uuid,uuid,text,jsonb,jsonb,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.block_expired_ai_worker_tasks(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.block_expired_ai_worker_tasks(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'execution lease RPCs must not be client-callable';
  END IF;
  IF has_column_privilege('authenticated', 'public.ai_worker_tasks', 'lease_token', 'SELECT')
     OR has_column_privilege('authenticated', 'public.ai_worker_tasks', 'lease_expires_at', 'SELECT')
     OR has_column_privilege('authenticated', 'public.ai_worker_tasks', 'execution_attempt_id', 'SELECT') THEN
    RAISE EXCEPTION 'browser clients must not read worker lease internals';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.ai_worker_tasks', 'id', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated users must retain task history reads';
  END IF;
END $acl$;

INSERT INTO public.ai_workers (id, organization_id, created_by, name, status, definition)
VALUES
  ('22000000-0000-0000-0000-000000000001', NULL, '00000000-0000-0000-0000-000000000001', 'Lease finish worker', 'active', '{}'::jsonb),
  ('22000000-0000-0000-0000-000000000002', NULL, '00000000-0000-0000-0000-000000000001', 'Lease cancel worker', 'active', '{}'::jsonb),
  ('22000000-0000-0000-0000-000000000003', NULL, '00000000-0000-0000-0000-000000000001', 'Lease expiry worker', 'active', '{}'::jsonb);

INSERT INTO public.ai_worker_tasks (id, worker_id, created_by, title, goal, status)
VALUES
  ('32000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Finish with evidence', 'Verify lease completion', 'queued'),
  ('32000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Cancel cooperatively', 'Verify stop request', 'queued'),
  ('32000000-0000-0000-0000-000000000003', '22000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'No evidence finish', 'Must remain running', 'queued'),
  ('32000000-0000-0000-0000-000000000004', '22000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Expired lease', 'Must be blocked for reconciliation', 'queued');

DO $claim_and_finish$
DECLARE
  result jsonb;
  v_lease uuid;
  v_status text;
  v_count integer;
BEGIN
  result := public.claim_ai_worker_task('22000000-0000-0000-0000-000000000001', 90);
  IF result->>'ok' <> 'true' OR result->>'empty' <> 'false' THEN
    RAISE EXCEPTION 'active worker should claim queued work: %', result;
  END IF;
  v_lease := (result->'task'->>'lease_token')::uuid;
  IF result->'task'->>'status' <> 'running'
     OR result->'task'->>'worker_version' <> '1'
     OR (result->'task'->>'attempt_count')::integer <> 1 THEN
    RAISE EXCEPTION 'claim must pin version, increment attempts and set running state';
  END IF;

  result := public.heartbeat_ai_worker_task(
    '32000000-0000-0000-0000-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 90
  );
  IF result->>'error' <> 'lease_not_owned' THEN
    RAISE EXCEPTION 'wrong lease token must be rejected';
  END IF;
  result := public.heartbeat_ai_worker_task('32000000-0000-0000-0000-000000000001', v_lease, 90);
  IF result->>'ok' <> 'true' THEN
    RAISE EXCEPTION 'current lease owner should be able to heartbeat';
  END IF;

  result := public.finish_ai_worker_task(
    '32000000-0000-0000-0000-000000000001', v_lease, 'done', '{"result":"report"}'::jsonb, NULL, NULL
  );
  IF result->>'error' <> 'completion_evidence_required' THEN
    RAISE EXCEPTION 'done must fail closed when evidence is null';
  END IF;

  result := public.finish_ai_worker_task(
    '32000000-0000-0000-0000-000000000001', v_lease, 'done', '{"result":"report"}'::jsonb,
    '[{"kind":"verification","summary":"Output schema passed","reference":"test-run:lease-001"}]'::jsonb,
    NULL
  );
  IF result->>'ok' <> 'true' OR result->'task'->>'status' <> 'done' THEN
    RAISE EXCEPTION 'evidence-backed completion should succeed: %', result;
  END IF;
  IF result->'task'->>'lease_token' IS NOT NULL OR result->'task'->>'lease_expires_at' IS NOT NULL THEN
    RAISE EXCEPTION 'finished task must release its lease';
  END IF;
  SELECT count(*) INTO v_count FROM public.ai_worker_task_events
  WHERE task_id = '32000000-0000-0000-0000-000000000001' AND event_type = 'verification_recorded';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'verified completion must append an audit event';
  END IF;
END $claim_and_finish$;

DO $cancellation$
DECLARE
  result jsonb;
  v_lease uuid;
BEGIN
  result := public.claim_ai_worker_task('22000000-0000-0000-0000-000000000002', 90);
  v_lease := (result->'task'->>'lease_token')::uuid;
  result := public.transition_ai_worker_task(
    '32000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001', 'cancel', NULL
  );
  IF result->>'ok' <> 'true' OR result->'task'->>'status' <> 'running' THEN
    RAISE EXCEPTION 'running cancellation should request cooperative stop';
  END IF;
  result := public.heartbeat_ai_worker_task('32000000-0000-0000-0000-000000000002', v_lease, 90);
  IF result->>'error' <> 'cancellation_requested' THEN
    RAISE EXCEPTION 'runner heartbeat should receive cancellation request';
  END IF;
  result := public.finish_ai_worker_task(
    '32000000-0000-0000-0000-000000000002', v_lease, 'cancelled', NULL, NULL, NULL
  );
  IF result->>'ok' <> 'true' OR result->'task'->>'status' <> 'cancelled' THEN
    RAISE EXCEPTION 'runner may mark cancelled only after confirming stop';
  END IF;
END $cancellation$;

DO $expired_lease$
DECLARE
  result jsonb;
  blocked_count integer;
BEGIN
  result := public.claim_ai_worker_task('22000000-0000-0000-0000-000000000003', 90);
  IF result->>'ok' <> 'true' OR result->>'empty' <> 'false' THEN
    RAISE EXCEPTION 'expiry worker should claim its task';
  END IF;
  UPDATE public.ai_worker_tasks
  SET lease_expires_at = now() - interval '1 second'
  WHERE id = '32000000-0000-0000-0000-000000000004';

  blocked_count := public.block_expired_ai_worker_tasks(50);
  IF blocked_count <> 1 THEN
    RAISE EXCEPTION 'expired lease should be blocked for reconciliation';
  END IF;
  IF (SELECT status FROM public.ai_worker_tasks WHERE id = '32000000-0000-0000-0000-000000000004') <> 'blocked'
     OR (SELECT error_text FROM public.ai_worker_tasks WHERE id = '32000000-0000-0000-0000-000000000004') NOT LIKE 'lease_expired_unknown_outcome:%' THEN
    RAISE EXCEPTION 'unknown external outcome must not be blindly retried';
  END IF;
END $expired_lease$;
