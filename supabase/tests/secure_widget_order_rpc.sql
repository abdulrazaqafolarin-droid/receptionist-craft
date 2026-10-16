-- Run after secure_widget_order_rpc.sql on an isolated PostgreSQL database.
INSERT INTO public.receptionists (id, active)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);

INSERT INTO public.services (id, receptionist_id, name, price, active, is_product)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Owner A Product', 12.50, true, true),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Owner B Product', 99.00, true, true),
  ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Unpriced Product', NULL, true, true),
  ('44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Inactive Product', 3.00, false, true);

DO $$
DECLARE
  v_order_id uuid;
  second_v_order_id uuid;
  total numeric;
  item_name text;
  item_price numeric;
  denied boolean;
BEGIN
  IF has_function_privilege('anon', 'public.create_widget_order(uuid,text,jsonb,text,text,text,jsonb,text)', 'EXECUTE') IS NOT TRUE
     OR has_function_privilege('authenticated', 'public.create_widget_order(uuid,text,jsonb,text,text,text,jsonb,text)', 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION 'widget order RPC must remain available to public widget roles';
  END IF;

  v_order_id := public.create_widget_order(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Customer',
    '[{"product_id":"11111111-1111-4111-8111-111111111111","product_name":"FAKE NAME","quantity":2,"unit_price":0.01}]'::jsonb,
    NULL, NULL, NULL, '{}'::jsonb, 'order-key-a'
  );

  SELECT total_amount INTO total FROM public.orders WHERE id = v_order_id;
  SELECT product_name, unit_price INTO item_name, item_price FROM public.order_items WHERE public.order_items.order_id = v_order_id;
  IF total <> 25.00 OR item_name <> 'Owner A Product' OR item_price <> 12.50 THEN
    RAISE EXCEPTION 'server catalog name and price must override client values';
  END IF;

  second_v_order_id := public.create_widget_order(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Customer',
    '[{"product_id":"11111111-1111-4111-8111-111111111111","quantity":2,"unit_price":999}]'::jsonb,
    NULL, NULL, NULL, '{}'::jsonb, 'order-key-a'
  );
  IF v_second_order_id <> v_order_id THEN
    RAISE EXCEPTION 'same receptionist idempotency key must return existing order';
  END IF;

  denied := false;
  BEGIN
    PERFORM public.create_widget_order(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'Other Customer',
      '[{"product_id":"22222222-2222-4222-8222-222222222222","quantity":1}]'::jsonb,
      NULL, NULL, NULL, '{}'::jsonb, 'order-key-a'
    );
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'idempotency key must not cross receptionist boundaries';
  END IF;

  denied := false;
  BEGIN
    PERFORM public.create_widget_order(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'Customer',
      '[{"product_id":"22222222-2222-4222-8222-222222222222","quantity":1}]'::jsonb,
      NULL, NULL, NULL, '{}'::jsonb, NULL
    );
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'cross-receptionist product must be rejected';
  END IF;

  denied := false;
  BEGIN
    PERFORM public.create_widget_order(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'Customer',
      '[{"product_id":"33333333-3333-4333-8333-333333333333","quantity":1}]'::jsonb,
      NULL, NULL, NULL, '{}'::jsonb, NULL
    );
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'unpriced product must be rejected';
  END IF;

  denied := false;
  BEGIN
    PERFORM public.create_widget_order(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'Customer',
      '[{"product_id":"44444444-4444-4444-8444-444444444444","quantity":1}]'::jsonb,
      NULL, NULL, NULL, '{}'::jsonb, NULL
    );
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'inactive product must be rejected';
  END IF;

  denied := false;
  BEGIN
    PERFORM public.create_widget_order(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'Customer',
      '[{"product_id":"11111111-1111-4111-8111-111111111111","quantity":-1}]'::jsonb,
      NULL, NULL, NULL, '{}'::jsonb, NULL
    );
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'non-positive quantity must be rejected';
  END IF;
END $$;
