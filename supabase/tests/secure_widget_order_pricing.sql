-- Run after the secure_widget_order_pricing migration on a disposable database.
DO $pricing_acl$
BEGIN
  IF has_function_privilege('anon', 'public.create_widget_order(uuid,text,jsonb,text,text,text,jsonb,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.create_widget_order(uuid,text,jsonb,text,text,text,jsonb,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'widget order write RPC must not be directly callable by client roles';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.create_widget_order(uuid,text,jsonb,text,text,text,jsonb,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must retain widget order RPC execution';
  END IF;
END $pricing_acl$;

INSERT INTO public.receptionists (id, active) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);

INSERT INTO public.services (id, receptionist_id, name, price, active, is_product) VALUES
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Catalog Product', 12.50, true, true),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Other Tenant Product', 99.00, true, true),
  ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Negative Price Product', -1.00, true, true);

INSERT INTO public.orders (id, receptionist_id, customer_name, total_amount, status, idempotency_key)
VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Other Tenant', 99.00, 'pending', 'foreign-key');

-- Ensure later migrations cannot reset the public SECURITY DEFINER RPC to
-- an unsafe search_path after the general function-hardening migration.
DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.create_widget_order(uuid,text,jsonb,text,text,text,jsonb,text)'::regprocedure
      AND p.proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp']
  ) THEN
    RAISE EXCEPTION 'widget order SECURITY DEFINER function must use hardened search_path';
  END IF;
END $;

DO $
DECLARE
  v_order_id uuid;
  v_replay_id uuid;
  v_caught boolean;
  v_total numeric;
  v_stored_name text;
  v_stored_price numeric;
  v_stored_quantity integer;
BEGIN
  -- Caller-supplied price/name are ignored in favor of catalog values.
  v_order_id := public.create_widget_order(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '  Customer  ',
    '[{"product_id":"11111111-1111-4111-8111-111111111111","quantity":2,"unit_price":0.01,"product_name":"Fake Cheap Item"}]'::jsonb,
    NULL, NULL, NULL, '{}'::jsonb, 'idem-a'
  );
  SELECT total_amount INTO v_total FROM public.orders o WHERE o.id = v_order_id;
  SELECT oi.product_name, oi.unit_price, oi.quantity
  INTO v_stored_name, v_stored_price, v_stored_quantity
  FROM public.order_items oi WHERE oi.order_id = v_order_id;
  IF v_total <> 25.00 OR v_stored_name <> 'Catalog Product' OR v_stored_price <> 12.50 OR v_stored_quantity <> 2 THEN
    RAISE EXCEPTION 'order total/item values must come from catalog price/name';
  END IF;

  v_replay_id := public.create_widget_order(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Customer',
    '[{"product_id":"11111111-1111-4111-8111-111111111111","quantity":2}]'::jsonb,
    NULL, NULL, NULL, '{}'::jsonb, 'idem-a'
  );
  IF v_replay_id <> v_order_id THEN
    RAISE EXCEPTION 'same-tenant idempotent replay must return the existing order';
  END IF;

  v_caught := false;
  BEGIN
    PERFORM public.create_widget_order(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'Customer',
      '[{"product_id":"11111111-1111-4111-8111-111111111111","quantity":-1}]'::jsonb,
      NULL, NULL, NULL, '{}'::jsonb, 'idem-negative'
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'negative quantity must be rejected'; END IF;

  v_caught := false;
  BEGIN
    PERFORM public.create_widget_order(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'Customer',
      '[{"product_id":"22222222-2222-4222-8222-222222222222","quantity":1}]'::jsonb,
      NULL, NULL, NULL, '{}'::jsonb, 'idem-foreign'
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'foreign receptionist product must be rejected'; END IF;

  v_caught := false;
  BEGIN
    PERFORM public.create_widget_order(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'Customer',
      '[{"product_id":"33333333-3333-4333-8333-333333333333","quantity":1}]'::jsonb,
      NULL, NULL, NULL, '{}'::jsonb, 'idem-negative-price'
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'negative catalog price must be rejected'; END IF;

  v_caught := false;
  BEGIN
    PERFORM public.create_widget_order(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'Customer',
      '[{"product_id":"11111111-1111-4111-8111-111111111111","quantity":1}]'::jsonb,
      NULL, NULL, NULL, '{}'::jsonb, 'foreign-key'
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'cross-tenant idempotency key must be rejected'; END IF;

  v_caught := false;
  BEGIN
    PERFORM public.create_widget_order(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'Customer',
      '{}'::jsonb,
      NULL, NULL, NULL, '{}'::jsonb, 'idem-not-array'
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'non-array items payload must be rejected'; END IF;
END $$;
