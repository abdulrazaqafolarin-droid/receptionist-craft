-- End-to-end RLS and client-write checks for ai_worker_foundation migration.
-- Run only against the disposable PostgreSQL service in worker-contract.yml.

INSERT INTO auth.users (id) VALUES
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003');

INSERT INTO public.organizations (id)
VALUES ('10000000-0000-0000-0000-000000000001');

INSERT INTO public.organization_members (organization_id, user_id, role, joined_at) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'member', now()),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'viewer', now()),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'member', NULL);

INSERT INTO public.ai_workers (id, organization_id, created_by, name, status) VALUES
  ('20000000-0000-0000-0000-000000000001', NULL, '00000000-0000-0000-0000-000000000001', 'User one personal worker', 'draft'),
  ('20000000-0000-0000-0000-000000000002', NULL, '00000000-0000-0000-0000-000000000002', 'User two personal worker', 'draft'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Shared org worker', 'draft');

INSERT INTO public.ai_worker_tasks (id, worker_id, created_by, title, goal) VALUES
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Personal task one', 'Check personal scope'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'Personal task two', 'Check personal scope'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Org task', 'Check organization scope');

-- Creator sees their personal worker and the shared org worker, not another
-- user's personal worker. Task access follows the linked worker.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.ai_workers) <> 2 THEN
    RAISE EXCEPTION 'user one should see exactly their personal worker and the org worker';
  END IF;
  IF (SELECT count(*) FROM public.ai_worker_tasks) <> 2 THEN
    RAISE EXCEPTION 'user one should see tasks attached to accessible workers only';
  END IF;
  BEGIN
    INSERT INTO public.ai_workers (created_by, name)
    VALUES ('00000000-0000-0000-0000-000000000001', 'Must not insert directly');
    RAISE EXCEPTION 'authenticated clients must not insert worker definitions directly';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    UPDATE public.ai_worker_tasks
    SET status = 'done'
    WHERE id = '30000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'authenticated clients must not mark tasks done directly';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$$;
ROLLBACK;

-- A joined viewer can read shared org workers, but not another user's
-- personal worker. An invited member who has not joined cannot read org data.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.ai_workers) <> 2 THEN
    RAISE EXCEPTION 'joined viewer should see own personal worker and shared org worker';
  END IF;
  IF (SELECT count(*) FROM public.ai_worker_tasks) <> 2 THEN
    RAISE EXCEPTION 'joined viewer should see tasks for accessible workers';
  END IF;
END
$$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.ai_workers) <> 0 THEN
    RAISE EXCEPTION 'invited but not joined member must not see organization workers';
  END IF;
  IF (SELECT count(*) FROM public.ai_worker_tasks) <> 0 THEN
    RAISE EXCEPTION 'invited but not joined member must not see organization tasks';
  END IF;
END
$$;
ROLLBACK;
