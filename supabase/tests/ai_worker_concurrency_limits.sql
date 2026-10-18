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
END $acl$;

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
