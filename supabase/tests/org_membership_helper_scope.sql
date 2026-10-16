-- Run after org_membership_helper_scope.sql on an isolated PostgreSQL database.
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.get_user_org_ids(uuid)', 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION 'anon must retain execute for PUBLIC-scoped RLS policies';
  END IF;
  IF has_function_privilege('authenticated', 'public.has_org_role(uuid,uuid,public.app_role)', 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION 'authenticated must retain execute for RLS policies';
  END IF;
END $$;

INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner'),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'owner');

DO $$
DECLARE
  org_count integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);

  SELECT count(*) INTO org_count
  FROM public.get_user_org_ids('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  IF org_count <> 0 THEN
    RAISE EXCEPTION 'caller must not enumerate another user organization IDs';
  END IF;

  IF public.has_org_role('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                         '22222222-2222-4222-8222-222222222222', 'owner') THEN
    RAISE EXCEPTION 'caller must not inspect another user role';
  END IF;

  IF public.is_org_member('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                          '22222222-2222-4222-8222-222222222222') THEN
    RAISE EXCEPTION 'caller must not inspect another user membership';
  END IF;

  SELECT count(*) INTO org_count
  FROM public.get_user_org_ids('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  IF org_count <> 1 THEN
    RAISE EXCEPTION 'caller must retain access to their own organization IDs';
  END IF;

  IF NOT public.has_org_role('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                             '11111111-1111-4111-8111-111111111111', 'owner') THEN
    RAISE EXCEPTION 'owner role check for current user must continue to work';
  END IF;

  IF NOT public.is_org_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                              '11111111-1111-4111-8111-111111111111') THEN
    RAISE EXCEPTION 'membership check for current user must continue to work';
  END IF;
END $$;
