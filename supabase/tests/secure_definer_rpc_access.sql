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
