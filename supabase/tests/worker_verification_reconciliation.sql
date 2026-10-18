-- Verify stale verification runs are bounded, worker-scoped and auditable.
-- Run after migration 20261018000007_worker_verification_reconciliation.sql.

DO $acl$
BEGIN
  IF has_function_privilege('anon', 'public.reconcile_stale_ai_worker_verification_runs(uuid,integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.reconcile_stale_ai_worker_verification_runs(uuid,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'stale-run reconciliation must be service-role only';
  END IF;
END $acl$;

INSERT INTO auth.users(id) VALUES ('58000000-0000-0000-0000-000000000001');
INSERT INTO public.ai_workers(id, organization_id, created_by, name, status, version, definition)
VALUES
 ('24000000-0000-0000-0000-000000000001', NULL, '58000000-0000-0000-0000-000000000001', 'Stale verification test A', 'draft', 1, '{"purpose":"test"}'::jsonb),
 ('24000000-0000-0000-0000-000000000002', NULL, '58000000-0000-0000-0000-000000000001', 'Stale verification test B', 'draft', 1, '{"purpose":"test"}'::jsonb);

INSERT INTO public.ai_worker_verification_runs(
  id, worker_id, actor_id, worker_version, definition_hash, definition_snapshot, status, tests, summary, created_at
) VALUES
 ('44000000-0000-0000-0000-000000000001', '24000000-0000-0000-0000-000000000001', '58000000-0000-0000-0000-000000000001', 1, repeat('a',64), '{"purpose":"test"}'::jsonb, 'running', '[]'::jsonb, 'stale', now() - interval '10 minutes'),
 ('44000000-0000-0000-0000-000000000002', '24000000-0000-0000-0000-000000000001', '58000000-0000-0000-0000-000000000001', 1, repeat('b',64), '{"purpose":"test"}'::jsonb, 'running', '[]'::jsonb, 'fresh', now()),
 ('44000000-0000-0000-0000-000000000003', '24000000-0000-0000-0000-000000000002', '58000000-0000-0000-0000-000000000001', 1, repeat('c',64), '{"purpose":"test"}'::jsonb, 'running', '[]'::jsonb, 'other worker stale', now() - interval '10 minutes');

DO $reconcile$
DECLARE
  v_result jsonb;
  v_status text;
  v_event_count integer;
BEGIN
  v_result := public.reconcile_stale_ai_worker_verification_runs(
    '24000000-0000-0000-0000-000000000001', 300, 10
  );
  IF v_result->>'ok' <> 'true' OR (v_result->>'reconciled')::integer <> 1 THEN
    RAISE EXCEPTION 'exactly one stale run for requested worker should be reconciled: %', v_result;
  END IF;

  SELECT status INTO v_status FROM public.ai_worker_verification_runs
  WHERE id = '44000000-0000-0000-0000-000000000001';
  IF v_status <> 'failed' THEN RAISE EXCEPTION 'stale run must become failed'; END IF;

  SELECT status INTO v_status FROM public.ai_worker_verification_runs
  WHERE id = '44000000-0000-0000-0000-000000000002';
  IF v_status <> 'running' THEN RAISE EXCEPTION 'fresh run must remain running'; END IF;

  SELECT status INTO v_status FROM public.ai_worker_verification_runs
  WHERE id = '44000000-0000-0000-0000-000000000003';
  IF v_status <> 'running' THEN RAISE EXCEPTION 'another worker run must remain untouched'; END IF;

  SELECT count(*) INTO v_event_count FROM public.ai_worker_lifecycle_events
  WHERE worker_id = '24000000-0000-0000-0000-000000000001'
    AND event_type = 'worker_verification_failed'
    AND details->>'reason' = 'stale_run_reconciled';
  IF v_event_count <> 1 THEN RAISE EXCEPTION 'reconciliation must append one failure audit event'; END IF;

  v_result := public.reconcile_stale_ai_worker_verification_runs(
    '24000000-0000-0000-0000-000000000001', 299, 10
  );
  IF v_result->>'error' <> 'invalid_reconciliation_request' THEN
    RAISE EXCEPTION 'stale threshold below minimum must be rejected';
  END IF;
END $reconcile$;
