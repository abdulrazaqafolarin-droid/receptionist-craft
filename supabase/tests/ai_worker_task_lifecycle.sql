-- Validate durable task snapshots, idempotency, audit-event visibility and server-only writes.
-- Run after the worker foundation and task lifecycle migrations in disposable PostgreSQL.

INSERT INTO public.ai_worker_tasks (
  id, worker_id, created_by, title, goal, idempotency_key, worker_version,
  worker_definition_snapshot
) VALUES (
  '30000000-0000-0000-0000-000000000011',
  '20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Idempotent task one', 'Test duplicate request protection', 'idem-key-123', 3,
  '{"schema_version":1,"purpose":"fixture"}'::jsonb
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_worker_tasks
    WHERE id = '30000000-0000-0000-0000-000000000011'
      AND worker_version = 3
      AND worker_definition_snapshot ->> 'purpose' = 'fixture'
  ) THEN
    RAISE EXCEPTION 'task must preserve the worker version and definition snapshot';
  END IF;

  BEGIN
    INSERT INTO public.ai_worker_tasks (
      worker_id, created_by, title, goal, idempotency_key
    ) VALUES (
      '20000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000001',
      'Duplicate task', 'Same idempotency key must not create a second task', 'idem-key-123'
    );
    RAISE EXCEPTION 'duplicate creator/idempotency key should be rejected';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END $$;

INSERT INTO public.ai_worker_task_events (task_id, actor_id, actor_kind, event_type, from_status, to_status, details)
VALUES
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'user', 'created', NULL, 'queued', '{"source":"test"}'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'user', 'created', NULL, 'queued', '{"source":"test"}'),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'director', 'created', NULL, 'queued', '{"source":"test"}');

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.ai_worker_task_events', 'INSERT')
     OR has_table_privilege('authenticated', 'public.ai_worker_task_events', 'INSERT')
     OR has_table_privilege('authenticated', 'public.ai_worker_task_events', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.ai_worker_task_events', 'DELETE') THEN
    RAISE EXCEPTION 'client roles must not write task audit events';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.ai_worker_task_events', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated users should have SELECT permission for RLS-filtered task events';
  END IF;
END $$;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.ai_worker_task_events) <> 2 THEN
    RAISE EXCEPTION 'user one should see events for their personal worker and shared org worker only';
  END IF;
  BEGIN
    INSERT INTO public.ai_worker_task_events (task_id, actor_kind, event_type)
    VALUES ('30000000-0000-0000-0000-000000000001', 'system', 'heartbeat');
    RAISE EXCEPTION 'authenticated clients must not insert task events';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.ai_worker_task_events) <> 0 THEN
    RAISE EXCEPTION 'unjoined invitee must not see organization task events';
  END IF;
END $$;
ROLLBACK;
