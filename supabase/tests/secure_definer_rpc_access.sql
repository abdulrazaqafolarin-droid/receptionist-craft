-- Run after secure_definer_rpc_access.sql on an isolated PostgreSQL database.
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.cleanup_old_conversations(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute cleanup routines';
  END IF;
  IF has_function_privilege('authenticated', 'public.cleanup_old_conversations(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must not execute cleanup routines';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.cleanup_old_conversations(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must retain maintenance execution';
  END IF;
  IF has_function_privilege('anon', 'public.deduct_stock(uuid,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.deduct_stock(uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'client roles must not call deduct_stock directly';
  END IF;
  IF has_function_privilege('anon', 'public.revert_config_version(uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute config revert';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.revert_config_version(uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated owner flow must retain config revert';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.record_manual_version(uuid,text)'::regprocedure
      AND p.proconfig @> ARRAY['search_path=public']
  ) THEN
    RAISE EXCEPTION 'record_manual_version must have a fixed search_path';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid IN (
      'public.handle_new_user()'::regprocedure,
      'public.touch_build_thread()'::regprocedure,
      'public.touch_director_thread()'::regprocedure,
      'public.update_business_modules_updated_at()'::regprocedure
    )
    AND NOT (p.proconfig @> ARRAY['search_path=public'])
  ) THEN
    RAISE EXCEPTION 'trigger SECURITY DEFINER functions must have a fixed search_path';
  END IF;
  IF has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.touch_build_thread()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.touch_build_thread()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.touch_director_thread()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.touch_director_thread()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.update_business_modules_updated_at()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.update_business_modules_updated_at()', 'EXECUTE') THEN
    RAISE EXCEPTION 'client roles must not directly execute trigger routines';
  END IF;

  IF NOT has_function_privilege('anon', 'public.get_user_org_ids(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.has_org_role(uuid,uuid,public.app_role)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.is_org_member(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'public RLS policies require helper execution with identity checks inside functions';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_user_org_ids(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.has_org_role(uuid,uuid,public.app_role)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.is_org_member(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated role must retain membership helper access for RLS';
  END IF;
END $$;

INSERT INTO public.services (id, stock_quantity)
VALUES ('11111111-1111-4111-8111-111111111111', 5);

DO $$
DECLARE
  result jsonb;
BEGIN
  result := public.deduct_stock('11111111-1111-4111-8111-111111111111', -2);
  IF COALESCE((result->>'success')::boolean, true) THEN
    RAISE EXCEPTION 'negative stock quantity should be rejected';
  END IF;
  IF (SELECT stock_quantity FROM public.services WHERE id = '11111111-1111-4111-8111-111111111111') <> 5 THEN
    RAISE EXCEPTION 'invalid quantity must not mutate inventory';
  END IF;

  result := public.deduct_stock('11111111-1111-4111-8111-111111111111', 2);
  IF COALESCE((result->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'valid positive stock deduction should succeed';
  END IF;
  IF (SELECT stock_quantity FROM public.services WHERE id = '11111111-1111-4111-8111-111111111111') <> 3 THEN
    RAISE EXCEPTION 'valid stock deduction should reduce stock by requested quantity';
  END IF;
END $$;

INSERT INTO public.receptionists (id, user_id, name, business_name, tone)
VALUES
  ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Owner A', 'Owner A', 'friendly'),
  ('33333333-3333-4333-8333-333333333333', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Owner B', 'Owner B', 'friendly');

INSERT INTO public.config_versions (receptionist_id, version_number, config_json, plan_text)
VALUES ('33333333-3333-4333-8333-333333333333', 1, '{}'::jsonb, 'fixture');

DO $$
DECLARE
  denied boolean := false;
  result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
  BEGIN
    PERFORM public.revert_config_version('33333333-3333-4333-8333-333333333333', 1);
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'cross-owner config revert was not denied';
  END IF;

  result := public.revert_config_version('22222222-2222-4222-8222-222222222222', 999);
  IF result->>'error' NOT LIKE 'Version % not found' THEN
    RAISE EXCEPTION 'owner should reach normal version lookup';
  END IF;
END $$;

INSERT INTO public.organization_members (user_id, organization_id, role)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 'owner'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '55555555-5555-4555-8555-555555555555', 'admin');

DO $$
DECLARE
  own_org_count integer;
BEGIN
  -- Anonymous callers can execute helpers for public RLS policies, but must
  -- not enumerate memberships or role assignments.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT count(*) INTO own_org_count
  FROM public.get_user_org_ids('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  IF own_org_count <> 0 THEN
    RAISE EXCEPTION 'anonymous caller must not enumerate organization ids';
  END IF;
  IF public.has_org_role('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 'owner') THEN
    RAISE EXCEPTION 'anonymous caller must not query organization roles';
  END IF;
  IF public.is_org_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444') THEN
    RAISE EXCEPTION 'anonymous caller must not query organization membership';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);

  SELECT count(*) INTO own_org_count
  FROM public.get_user_org_ids('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  IF own_org_count <> 1 THEN
    RAISE EXCEPTION 'caller should see their own organization ids';
  END IF;

  SELECT count(*) INTO own_org_count
  FROM public.get_user_org_ids('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  IF own_org_count <> 0 THEN
    RAISE EXCEPTION 'caller must not enumerate another user organizations';
  END IF;

  IF public.has_org_role('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '55555555-5555-4555-8555-555555555555', 'admin') THEN
    RAISE EXCEPTION 'caller must not query another user role';
  END IF;
  IF public.is_org_member('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '55555555-5555-4555-8555-555555555555') THEN
    RAISE EXCEPTION 'caller must not query another user membership';
  END IF;
  IF NOT public.has_org_role('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 'owner') THEN
    RAISE EXCEPTION 'caller should still resolve their own role';
  END IF;
END $$;
