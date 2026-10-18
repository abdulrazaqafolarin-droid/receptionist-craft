-- Regression tests for the durable AI Worker task lifecycle migration.
-- Run only after worker_foundation_bootstrap.sql, the foundation migration,
-- ai_worker_foundation_rls.sql, and the task lifecycle migration on disposable PG.

DO $acl$
BEGIN
  IF has_function_privilege('anon', 'public.create_ai_worker_task(uuid,uuid,text,text,jsonb,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.create_ai_worker_task(uuid,uuid,text,text,jsonb,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'task creation RPC must be service-role only';
  END IF;
  IF has_function_privilege('anon', 'public.transition_ai_worker_task(uuid,uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.transition_ai_worker_task(uuid,uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'task transition RPC must be service-role only';
  END IF;
  IF has_table_privilege('authenticated', 'public.ai_worker_task_events', 'INSERT')
     OR has_table_privilege('authenticated', 'public.ai_worker_task_events', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.ai_worker_task_events', 'DELETE') THEN
    RAISE EXCEPTION 'clients must not mutate task audit events';
  END IF;
END $acl$;

INSERT INTO public.ai_workers (id, organization_id, created_by, name, status, definition)
VALUES (
  '21000000-0000-0000-0000-000000000001', NULL,
  '00000000-0000-0000-0000-000000000001', 'Active task test worker', 'active', '{}'::jsonb
);

DO $create_idempotency$
DECLARE
  first_result jsonb;
  replay_result jsonb;
  conflict_result jsonb;
  task_id uuid;
  event_count integer;
BEGIN
  first_result := public.create_ai_worker_task(
    '21000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Create a report', 'Research approved sources', '{"topic":"service market"}'::jsonb,
    'task-create-001'
  );
  IF first_result->>'ok' <> 'true' OR first_result->>'replayed' <> 'false' THEN
    RAISE EXCEPTION 'first request should create a new queued task: %', first_result;
  END IF;
  task_id := (first_result->'task'->>'id')::uuid;

  replay_result := public.create_ai_worker_task(
    '21000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Create a report', 'Research approved sources', '{"topic":"service market"}'::jsonb,
    'task-create-001'
  );
  IF replay_result->>'ok' <> 'true'
     OR replay_result->>'replayed' <> 'true'
     OR (replay_result->'task'->>'id')::uuid <> task_id THEN
    RAISE EXCEPTION 'same idempotency key and payload must return the original task';
  END IF;

  conflict_result := public.create_ai_worker_task(
    '21000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Different report', 'Different goal', '{}'::jsonb, 'task-create-001'
  );
  IF conflict_result->>'error' <> 'idempotency_key_reused' THEN
    RAISE EXCEPTION 'same idempotency key with different payload must fail closed';
  END IF;

  SELECT count(*) INTO event_count FROM public.ai_worker_task_events WHERE task_id = task_id;
  IF event_count <> 1 THEN
    RAISE EXCEPTION 'replays must not duplicate task-created audit events';
  END IF;
END $create_idempotency$;

INSERT INTO public.ai_worker_tasks (
  id, worker_id, created_by, title, goal, status, approval_request
) VALUES (
  '31000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Approve external action', 'Perform the exact reviewed action',
  'waiting_approval', '{"approval_id":"approval-0001","summary":"Send reviewed draft"}'::jsonb
), (
  '31000000-0000-0000-0000-000000000002',
  '21000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Cancel running work', 'Test cancellation handshake', 'running', '{}'::jsonb
), (
  '31000000-0000-0000-0000-000000000003',
  '21000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Cancel queued work', 'Test queued cancellation', 'queued', '{}'::jsonb
);

DO $transition_safety$
DECLARE
  result jsonb;
  task_status text;
  event_type text;
BEGIN
  result := public.transition_ai_worker_task(
    '31000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001', 'approve', 'wrong-approval'
  );
  IF result->>'error' <> 'approval_request_mismatch' THEN
    RAISE EXCEPTION 'approval must match the exact pending approval request';
  END IF;

  result := public.transition_ai_worker_task(
    '31000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001', 'approve', 'approval-0001'
  );
  IF result->>'ok' <> 'true' OR result->'task'->>'status' <> 'queued' THEN
    RAISE EXCEPTION 'matching approval should return task to queued';
  END IF;
  IF (result->'task'->>'approved_by')::uuid <> '00000000-0000-0000-0000-000000000001' THEN
    RAISE EXCEPTION 'approval actor must be recorded';
  END IF;

  result := public.transition_ai_worker_task(
    '31000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001', 'cancel', NULL
  );
  IF result->>'ok' <> 'true' OR result->'task'->>'status' <> 'running'
     OR result->'task'->>'cancel_requested_at' IS NULL THEN
    RAISE EXCEPTION 'running task cancellation must request stop, not falsely mark cancelled';
  END IF;
  SELECT event_type INTO event_type FROM public.ai_worker_task_events
    WHERE task_id = '31000000-0000-0000-0000-000000000002'
    ORDER BY created_at DESC LIMIT 1;
  IF event_type <> 'cancel_requested' THEN
    RAISE EXCEPTION 'running task should append cancel_requested event';
  END IF;

  result := public.transition_ai_worker_task(
    '31000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001', 'cancel', NULL
  );
  IF result->>'ok' <> 'true' OR result->'task'->>'status' <> 'cancelled' THEN
    RAISE EXCEPTION 'queued task can be safely cancelled';
  END IF;

  result := public.transition_ai_worker_task(
    '31000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001', NULL, NULL
  );
  IF result->>'error' <> 'invalid_transition' THEN
    RAISE EXCEPTION 'null transition action must fail closed';
  END IF;
END $transition_safety$;
