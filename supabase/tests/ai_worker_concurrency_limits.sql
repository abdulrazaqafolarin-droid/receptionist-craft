-- Concurrency ceilings must be enforced in the database, not only in the runner.
-- Fixtures are inserted as already-running rows to model work claimed before this
-- guard existed; the queued->running transition under test must be rejected.

DO $acl$
BEGIN
  IF has_function_privilege('anon', 'public.enforce_ai_worker_task_concurrency()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.enforce_ai_worker_task_concurrency()', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.enforce_ai_worker_task_concurrency()', 'EXECUTE') THEN
    RAISE EXCEPTION 'trigger-only concurrency guard must not be directly executable';
  END IF;
  IF has_function_privilege('anon', 'public.block_expired_ai_worker_tasks_for_worker(uuid,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.block_expired_ai_worker_tasks_for_worker(uuid,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.block_expired_ai_worker_tasks_for_worker(uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'worker-scoped lease recovery must be service-role only';
  END IF;
END $acl$;

-- Earlier worker regression tests may intentionally leave a running task to
-- test pause/cancellation gates. Reset those disposable fixtures so the global
-- cap assertion is exact and independent of test ordering.
UPDATE public.ai_worker_tasks
SET status = 'blocked', lease_token = NULL, lease_expires_at = NULL,
    error_text = 'concurrency test fixture reset', updated_at = now()
WHERE status = 'running';

-- Per-worker cap: two active tasks already occupy this worker.
INSERT INTO auth.users(id) VALUES (md5('concurrency-worker-user')::uuid);
INSERT INTO public.ai_workers(id, organization_id, created_by, name, description, status, version, definition, verified_version)
VALUES (md5('concurrency-worker')::uuid, NULL, md5('concurrency-worker-user')::uuid, 'Concurrency worker', '', 'active', 1, '{"purpose":"concurrency-test"}'::jsonb, 1);
INSERT INTO public.ai_worker_verification_runs(id, worker_id, actor_id, worker_version, definition_hash, definition_snapshot, status, tests, summary, completed_at)
VALUES (md5('concurrency-worker-run')::uuid, md5('concurrency-worker')::uuid, md5('concurrency-worker-user')::uuid, 1, repeat('a',64), '{"purpose":"concurrency-test"}'::jsonb, 'passed', '[]'::jsonb, 'passed', now());
UPDATE public.ai_workers SET verification_run_id = md5('concurrency-worker-run')::uuid WHERE id = md5('concurrency-worker')::uuid;

INSERT INTO public.ai_worker_tasks(id, worker_id, created_by, title, goal, status, lease_token, lease_expires_at, worker_version, execution_attempt_id)
SELECT md5('concurrency-worker-running-' || n)::uuid, md5('concurrency-worker')::uuid, md5('concurrency-worker-user')::uuid,
       'Existing task ' || n, 'Existing running task', 'running', md5('lease-worker-' || n)::uuid, now() + interval '1 minute', 1, md5('attempt-worker-' || n)::uuid
FROM generate_series(1,2) AS n;
INSERT INTO public.ai_worker_tasks(id, worker_id, created_by, title, goal, status)
VALUES (md5('concurrency-worker-queued')::uuid, md5('concurrency-worker')::uuid, md5('concurrency-worker-user')::uuid, 'Queued task', 'Must wait for worker capacity', 'queued');

DO $worker_cap$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.claim_ai_worker_task_for_task(md5('concurrency-worker')::uuid, md5('concurrency-worker-queued')::uuid, 90);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'worker_concurrency_limit_worker' THEN RAISE; END IF;
    denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'per-worker ceiling must reject a third active task'; END IF;
  IF (SELECT status FROM public.ai_worker_tasks WHERE id = md5('concurrency-worker-queued')::uuid) <> 'queued' THEN
    RAISE EXCEPTION 'worker-cap rejection must leave task queued';
  END IF;
END $worker_cap$;

-- Per-user cap: three tasks across separate personal workers are already running.
INSERT INTO auth.users(id) VALUES (md5('concurrency-user-shared')::uuid);
INSERT INTO auth.users(id)
SELECT md5('concurrency-user-worker-' || n)::uuid FROM generate_series(1,4) AS n;
INSERT INTO public.ai_workers(id, organization_id, created_by, name, description, status, version, definition, verified_version)
SELECT md5('concurrency-user-worker-' || n)::uuid, NULL, md5('concurrency-user-shared')::uuid,
       'User worker ' || n, '', 'active', 1, '{"purpose":"concurrency-test"}'::jsonb, 1
FROM generate_series(1,4) AS n;
INSERT INTO public.ai_worker_verification_runs(id, worker_id, actor_id, worker_version, definition_hash, definition_snapshot, status, tests, summary, completed_at)
SELECT md5('concurrency-user-run-' || n)::uuid, md5('concurrency-user-worker-' || n)::uuid, md5('concurrency-user-shared')::uuid,
       1, repeat('b',64), '{"purpose":"concurrency-test"}'::jsonb, 'passed', '[]'::jsonb, 'passed', now()
FROM generate_series(1,4) AS n;
UPDATE public.ai_workers w
SET verification_run_id = md5('concurrency-user-run-' || n)::uuid
FROM generate_series(1,4) AS n
WHERE w.id = md5('concurrency-user-worker-' || n)::uuid;
INSERT INTO public.ai_worker_tasks(id, worker_id, created_by, title, goal, status, lease_token, lease_expires_at, worker_version, execution_attempt_id)
SELECT md5('concurrency-user-running-' || n)::uuid, md5('concurrency-user-worker-' || n)::uuid, md5('concurrency-user-shared')::uuid,
       'User running task ' || n, 'Existing running task', 'running', md5('lease-user-' || n)::uuid, now() + interval '1 minute', 1, md5('attempt-user-' || n)::uuid
FROM generate_series(1,3) AS n;
INSERT INTO public.ai_worker_tasks(id, worker_id, created_by, title, goal, status)
VALUES (md5('concurrency-user-queued')::uuid, md5('concurrency-user-worker-4')::uuid, md5('concurrency-user-shared')::uuid, 'User queued task', 'Must wait for user capacity', 'queued');

DO $user_cap$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.claim_ai_worker_task_for_task(md5('concurrency-user-worker-4')::uuid, md5('concurrency-user-queued')::uuid, 90);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'worker_concurrency_limit_user' THEN RAISE; END IF;
    denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'per-user ceiling must reject a fourth active task'; END IF;
END $user_cap$;

-- Lease recovery exposed by the runner must only affect the authorized worker.
INSERT INTO public.ai_worker_tasks(id, worker_id, created_by, title, goal, status, lease_token, lease_expires_at, worker_version, execution_attempt_id)
VALUES
 (md5('concurrency-worker-expired')::uuid, md5('concurrency-worker')::uuid, md5('concurrency-worker-user')::uuid,
  'Expired task on authorized worker', 'Must be blocked', 'running', md5('lease-expired-own')::uuid, now() - interval '1 minute', 1, md5('attempt-expired-own')::uuid),
 (md5('concurrency-user-expired')::uuid, md5('concurrency-user-worker-1')::uuid, md5('concurrency-user-shared')::uuid,
  'Expired task on another worker', 'Must remain untouched', 'running', md5('lease-expired-other')::uuid, now() - interval '1 minute', 1, md5('attempt-expired-other')::uuid);

DO $scoped_recovery$
DECLARE recovered integer;
BEGIN
  recovered := public.block_expired_ai_worker_tasks_for_worker(md5('concurrency-worker')::uuid, 50);
  IF recovered <> 1 THEN RAISE EXCEPTION 'worker-scoped recovery should block only one expired task'; END IF;
  IF (SELECT status FROM public.ai_worker_tasks WHERE id = md5('concurrency-worker-expired')::uuid) <> 'blocked' THEN
    RAISE EXCEPTION 'expired task on requested worker must be blocked';
  END IF;
  IF (SELECT status FROM public.ai_worker_tasks WHERE id = md5('concurrency-user-expired')::uuid) <> 'running' THEN
    RAISE EXCEPTION 'request must not block an expired task on another worker';
  END IF;
END $scoped_recovery$;

-- Per-organization cap: ten tasks across separate workers and users are running.
INSERT INTO public.organizations(id) VALUES (md5('concurrency-org')::uuid);
INSERT INTO auth.users(id)
SELECT md5('concurrency-org-user-' || n)::uuid FROM generate_series(1,11) AS n;
INSERT INTO public.ai_workers(id, organization_id, created_by, name, description, status, version, definition, verified_version)
SELECT md5('concurrency-org-worker-' || n)::uuid, md5('concurrency-org')::uuid, md5('concurrency-org-user-' || n)::uuid,
       'Org worker ' || n, '', 'active', 1, '{"purpose":"concurrency-test"}'::jsonb, 1
FROM generate_series(1,11) AS n;
INSERT INTO public.ai_worker_verification_runs(id, worker_id, actor_id, worker_version, definition_hash, definition_snapshot, status, tests, summary, completed_at)
SELECT md5('concurrency-org-run-' || n)::uuid, md5('concurrency-org-worker-' || n)::uuid, md5('concurrency-org-user-' || n)::uuid,
       1, repeat('c',64), '{"purpose":"concurrency-test"}'::jsonb, 'passed', '[]'::jsonb, 'passed', now()
FROM generate_series(1,11) AS n;
UPDATE public.ai_workers w
SET verification_run_id = md5('concurrency-org-run-' || n)::uuid
FROM generate_series(1,11) AS n
WHERE w.id = md5('concurrency-org-worker-' || n)::uuid;
INSERT INTO public.ai_worker_tasks(id, worker_id, created_by, title, goal, status, lease_token, lease_expires_at, worker_version, execution_attempt_id)
SELECT md5('concurrency-org-running-' || n)::uuid, md5('concurrency-org-worker-' || n)::uuid, md5('concurrency-org-user-' || n)::uuid,
       'Org running task ' || n, 'Existing running task', 'running', md5('lease-org-' || n)::uuid, now() + interval '1 minute', 1, md5('attempt-org-' || n)::uuid
FROM generate_series(1,10) AS n;
INSERT INTO public.ai_worker_tasks(id, worker_id, created_by, title, goal, status)
VALUES (md5('concurrency-org-queued')::uuid, md5('concurrency-org-worker-11')::uuid, md5('concurrency-org-user-11')::uuid, 'Org queued task', 'Must wait for organization capacity', 'queued');

DO $org_cap$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.claim_ai_worker_task_for_task(md5('concurrency-org-worker-11')::uuid, md5('concurrency-org-queued')::uuid, 90);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'worker_concurrency_limit_organization' THEN RAISE; END IF;
    denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'per-organization ceiling must reject an eleventh active task'; END IF;
END $org_cap$;

-- Global cap: 2 + 3 + 10 tasks are already running; 35 more fill the 50-slot cap.
INSERT INTO auth.users(id)
SELECT md5('concurrency-global-user-' || n)::uuid FROM generate_series(1,36) AS n;
INSERT INTO public.ai_workers(id, organization_id, created_by, name, description, status, version, definition, verified_version)
SELECT md5('concurrency-global-worker-' || n)::uuid, NULL, md5('concurrency-global-user-' || n)::uuid,
       'Global worker ' || n, '', 'active', 1, '{"purpose":"concurrency-test"}'::jsonb, 1
FROM generate_series(1,36) AS n;
INSERT INTO public.ai_worker_verification_runs(id, worker_id, actor_id, worker_version, definition_hash, definition_snapshot, status, tests, summary, completed_at)
SELECT md5('concurrency-global-run-' || n)::uuid, md5('concurrency-global-worker-' || n)::uuid, md5('concurrency-global-user-' || n)::uuid,
       1, repeat('d',64), '{"purpose":"concurrency-test"}'::jsonb, 'passed', '[]'::jsonb, 'passed', now()
FROM generate_series(1,36) AS n;
UPDATE public.ai_workers w
SET verification_run_id = md5('concurrency-global-run-' || n)::uuid
FROM generate_series(1,36) AS n
WHERE w.id = md5('concurrency-global-worker-' || n)::uuid;
INSERT INTO public.ai_worker_tasks(id, worker_id, created_by, title, goal, status, lease_token, lease_expires_at, worker_version, execution_attempt_id)
SELECT md5('concurrency-global-running-' || n)::uuid, md5('concurrency-global-worker-' || n)::uuid, md5('concurrency-global-user-' || n)::uuid,
       'Global running task ' || n, 'Existing running task', 'running', md5('lease-global-' || n)::uuid, now() + interval '1 minute', 1, md5('attempt-global-' || n)::uuid
FROM generate_series(1,35) AS n;
INSERT INTO public.ai_worker_tasks(id, worker_id, created_by, title, goal, status)
VALUES (md5('concurrency-global-queued')::uuid, md5('concurrency-global-worker-36')::uuid, md5('concurrency-global-user-36')::uuid, 'Global queued task', 'Must wait for global capacity', 'queued');

DO $global_cap$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.claim_ai_worker_task_for_task(md5('concurrency-global-worker-36')::uuid, md5('concurrency-global-queued')::uuid, 90);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'worker_concurrency_limit_global' THEN RAISE; END IF;
    denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'global ceiling must reject a 51st active task'; END IF;
END $global_cap$;
