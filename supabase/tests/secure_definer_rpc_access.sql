-- Run after secure_definer_rpc_access.sql on an isolated PostgreSQL database.
DO $privileges$
BEGIN
  IF has_function_privilege('anon', 'public.cleanup_old_conversations(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute cleanup routines';
  END IF;
  IF has_function_privilege('authenticated', 'public.cleanup_old_conversations(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must not execute cleanup routines';
  END IF;
  IF has_function_privilege('anon', 'public.cleanup_old_booking_suggestions(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.cleanup_old_booking_suggestions(integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.cleanup_old_chat_messages(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.cleanup_old_chat_messages(integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.cleanup_old_conversation_state(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.cleanup_old_conversation_state(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'all cleanup routines must be inaccessible to client roles';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.cleanup_old_conversations(integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.cleanup_old_booking_suggestions(integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.cleanup_old_chat_messages(integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.cleanup_old_conversation_state(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must retain maintenance execution';
  END IF;
  IF has_function_privilege('anon', 'public.record_manual_version(uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.record_manual_version(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'manual version snapshots must be signed-in owner-only RPCs';
  END IF;
  IF has_function_privilege('anon', 'public.deduct_stock(uuid,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.deduct_stock(uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'client roles must not call deduct_stock directly';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.deduct_stock(uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must retain inventory deduction access';
  END IF;
  -- Public widget traffic is routed through widget-chat; browsers must not
  -- invoke the write RPC directly.
  IF has_function_privilege('anon', 'public.create_widget_order(uuid,text,jsonb,text,text,text,jsonb,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.create_widget_order(uuid,text,jsonb,text,text,text,jsonb,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'client roles must not call the widget order write RPC directly';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.create_widget_order(uuid,text,jsonb,text,text,text,jsonb,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must retain widget order RPC execution';
  END IF;
  IF has_function_privilege('anon', 'public.create_widget_appointment(uuid,text,text,timestamp with time zone,timestamp with time zone,text,text,uuid,text,text,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.create_widget_appointment(uuid,text,text,timestamp with time zone,timestamp with time zone,text,text,uuid,text,text,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'clients must not bypass server-side widget booking validation';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.create_widget_appointment(uuid,text,text,timestamp with time zone,timestamp with time zone,text,text,uuid,text,text,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must retain legacy widget booking access';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.create_widget_order(uuid,text,jsonb,text,text,text,jsonb,text)'::regprocedure
      AND p.proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp']
  ) THEN
    RAISE EXCEPTION 'widget order SECURITY DEFINER function must have hardened search_path';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.create_widget_appointment(uuid,text,text,timestamp with time zone,timestamp with time zone,text,text,uuid,text,text,text,jsonb)'::regprocedure
      AND p.proconfig @> ARRAY['search_path=pg_catalog, extensions, public, pg_temp']
  ) THEN
    RAISE EXCEPTION 'widget appointment SECURITY DEFINER function must include the locked-down extensions schema for pgcrypto';
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
      AND p.proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp']
  ) THEN
    RAISE EXCEPTION 'record_manual_version must have a hardened search_path';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid IN (
      'public.cleanup_old_booking_suggestions(integer)'::regprocedure,
      'public.cleanup_old_chat_messages(integer)'::regprocedure,
      'public.cleanup_old_conversation_state(integer)'::regprocedure,
      'public.cleanup_old_conversations(integer)'::regprocedure
    )
    AND NOT (p.proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp'])
  ) THEN
    RAISE EXCEPTION 'cleanup SECURITY DEFINER functions must have a hardened search_path';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid IN (
      'public.handle_new_user()'::regprocedure,
      'public.touch_build_thread()'::regprocedure,
      'public.touch_director_thread()'::regprocedure,
      'public.update_business_modules_updated_at()'::regprocedure,
      'public.handle_new_organization()'::regprocedure,
      'public.sync_receptionist_phones()'::regprocedure
    )
    AND NOT (p.proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp'])
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
     OR has_function_privilege('authenticated', 'public.update_business_modules_updated_at()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.handle_new_organization()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.handle_new_organization()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.sync_receptionist_phones()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.sync_receptionist_phones()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.rls_auto_enable()', 'EXECUTE') THEN
    RAISE EXCEPTION 'client roles must not directly execute trigger routines';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.get_user_org_ids(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.has_org_role(uuid,uuid,public.app_role)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.is_org_member(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated role must retain membership helper access for RLS';
  END IF;
  IF has_function_privilege('anon', 'public.get_appointment_by_token(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.get_appointment_by_token(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'legacy full-row appointment token lookup must not be client-executable';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.get_appointment_by_token(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must retain legacy appointment token lookup access';
  END IF;
  IF NOT has_function_privilege('anon', 'public.get_public_appointment_by_token(text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_public_appointment_by_token(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'public appointment pages must retain safe token lookup access';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.get_public_appointment_by_token(text)'::regprocedure
      AND p.proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp']
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.get_appointment_by_token(text)'::regprocedure
      AND p.proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp']
  ) THEN
    RAISE EXCEPTION 'appointment token lookup functions must use hardened search paths';
  END IF;

END $privileges$;

DO $legacy_rpc_acl$
DECLARE
  fn regprocedure;
BEGIN
  IF has_function_privilege('anon', 'public.insert_booking_suggestion(uuid,text,jsonb,text,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.insert_booking_suggestion(uuid,text,jsonb,text,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.insert_conversion_event(uuid,text,text,numeric,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.insert_conversion_event(uuid,text,text,numeric,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.upsert_conversation_state(uuid,text,text,text,text,double precision,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.upsert_conversation_state(uuid,text,text,text,text,double precision,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.upsert_conversation_summary(uuid,text,text,jsonb,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.upsert_conversation_summary(uuid,text,text,jsonb,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'legacy widget write RPCs must not be callable by client roles';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.insert_booking_suggestion(uuid,text,jsonb,text,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.insert_conversion_event(uuid,text,text,numeric,text,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.upsert_conversation_state(uuid,text,text,text,text,double precision,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.upsert_conversation_summary(uuid,text,text,jsonb,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must retain internal widget write RPC access';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    WHERE p.oid IN (
      'public.insert_booking_suggestion(uuid,text,jsonb,text,integer)'::regprocedure,
      'public.insert_conversion_event(uuid,text,text,numeric,text,jsonb)'::regprocedure,
      'public.upsert_conversation_state(uuid,text,text,text,text,double precision,jsonb)'::regprocedure,
      'public.upsert_conversation_summary(uuid,text,text,jsonb,text)'::regprocedure
    )
    AND NOT (p.proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp'])
  ) THEN
    RAISE EXCEPTION 'legacy widget write RPCs must use a hardened search_path';
  END IF;
END $legacy_rpc_acl$;

INSERT INTO public.appointments (
  id, service, start_time, customer_name, customer_phone, customer_email,
  status, cancellation_token, confirmation_token
) VALUES (
  '66666666-6666-4666-8666-666666666666', 'Test service', now(),
  'Token Customer', '555-0100', 'customer@example.test', 'booked',
  'cancel-token-1234567890', 'confirm-token-1234567890'
);

DO $token_projection$
DECLARE
  result record;
  result_json jsonb;
BEGIN
  SELECT * INTO result
  FROM public.get_public_appointment_by_token('confirm-token-1234567890');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'valid confirmation token should resolve appointment details';
  END IF;
  result_json := to_jsonb(result);
  IF result.id <> '66666666-6666-4666-8666-666666666666'
     OR result.customer_name <> 'Token Customer'
     OR result.customer_email <> 'customer@example.test' THEN
    RAISE EXCEPTION 'safe appointment lookup must return the required public display fields';
  END IF;
  IF result_json ? 'cancellation_token' OR result_json ? 'confirmation_token' THEN
    RAISE EXCEPTION 'safe appointment lookup must not disclose either stored action token';
  END IF;
END $token_projection$;

INSERT INTO public.services (id, name, stock_quantity)
VALUES ('11111111-1111-4111-8111-111111111111', 'Test product', 5);

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

SELECT set_config('request.jwt.claim.sub', '', false);
DO $$
DECLARE
  own_org_count integer;
BEGIN
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
END $$;

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
DO $$
DECLARE
  own_org_count integer;
BEGIN
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

SELECT set_config('request.jwt.claim.sub', '', false);
