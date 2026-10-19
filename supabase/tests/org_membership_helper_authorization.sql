-- Run after 20261020000003_secure_org_membership_helpers.sql in PostgreSQL 17.
DO $org_helper_privileges$
BEGIN
  IF has_function_privilege('anon', 'public.get_user_org_ids(uuid)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('anon', 'public.has_org_role(uuid,uuid,public.app_role)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('anon', 'public.is_org_member(uuid,uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'anonymous callers must not execute organization membership helpers';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.get_user_org_ids(uuid)'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.has_org_role(uuid,uuid,public.app_role)'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.is_org_member(uuid,uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated callers need execute permission for RLS helper functions';
  END IF;
END $org_helper_privileges$;

INSERT INTO public.organization_members (user_id, organization_id, role, joined_at) VALUES
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner', now()),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'admin', NULL),
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'admin', now());

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
DO $user_one$
BEGIN
  IF (SELECT count(*) FROM public.get_user_org_ids('00000000-0000-0000-0000-000000000001')) <> 1
     OR NOT EXISTS (SELECT 1 FROM public.get_user_org_ids('00000000-0000-0000-0000-000000000001')
                    WHERE get_user_org_ids = '10000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'caller should only receive their joined organization';
  END IF;

  IF (SELECT count(*) FROM public.get_user_org_ids('00000000-0000-0000-0000-000000000002')) <> 0 THEN
    RAISE EXCEPTION 'caller must not enumerate another user organization IDs';
  END IF;

  IF NOT public.has_org_role('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner'::public.app_role) THEN
    RAISE EXCEPTION 'caller should retain their own joined owner role';
  END IF;

  IF public.has_org_role('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'admin'::public.app_role)
     OR public.is_org_member('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003') THEN
    RAISE EXCEPTION 'caller must not probe another user membership or role';
  END IF;

  IF public.has_org_role('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'admin'::public.app_role)
     OR public.is_org_member('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'pending membership must not grant access';
  END IF;
END $user_one$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
DO $user_two$
BEGIN
  IF (SELECT count(*) FROM public.get_user_org_ids('00000000-0000-0000-0000-000000000002')) <> 1
     OR NOT public.has_org_role('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'second user should retain their own joined organization and role';
  END IF;
END $user_two$;
ROLLBACK;
