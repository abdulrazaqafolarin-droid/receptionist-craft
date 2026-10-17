-- Regression tests for the public widget order RPC. Run after the migration
-- against a disposable database only.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

CREATE TABLE public.receptionists (
  id uuid PRIMARY KEY,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.services (
  id uuid PRIMARY KEY,
  receptionist_id uuid NOT NULL REFERENCES public.receptionists(id),
  name text NOT NULL,
  price numeric,
  active boolean DEFAULT true,
  is_product boolean DEFAULT false
);
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id uuid NOT NULL REFERENCES public.receptionists(id),
  customer_name text NOT NULL,
  customer_email text,
  customer_phone text,
  notes text,
  total_amount numeric,
  metadata jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  idempotency_key text UNIQUE
);
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric
);

CREATE OR REPLACE FUNCTION public.create_widget_order(
  p_receptionist_id uuid,
  p_customer_name text,
  p_items jsonb,
  p_customer_email text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_idempotency_key text DEFAULT NULL
) RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
GRANT EXECUTE ON FUNCTION public.create_widget_order(uuid,text,jsonb,text,text,text,jsonb,text) TO PUBLIC;

INSERT INTO public.receptionists (id, active) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
INSERT INTO public.services (id, receptionist_id, name, price, active, is_product) VALUES
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Catalog Product', 12.50, true, true),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Other Tenant Product', 99.00, true, true);

DO $$
DECLARE
  order_id uuid;
  replay_id uuid;
  caught boolean;
  total numeric;
  stored_name text;
  stored_price numeric;
  stored_quantity integer;
BEGIN
  -- Caller-supplied price/name are ignored in favor of catalog values.
  order_id := public.create_widget_order(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '  Customer  ',
    '[{"product_id":"11111111-1111-4111-8111-111111111111","quantity":2,"unit_price":0.01,"product_name":"Fake Cheap Item"}]'::jsonb,
    NULL, NULL, NULL, '{}'::jsonb, 'idem-a'
  );
  SELECT total_amount INTO total FROM public.orders WHERE id = order_id;
  SELECT product_name, unit_price, quantity INTO stored_name, stored_price, stored_quantity
  FROM public.order_items WHERE order_id = order_id;
  IF total <> 25.00 OR stored_name <> 'Catalog Product' OR stored_price <> 12.50 OR stored_quantity <> 2 THEN
    RAISE EXCEPTION 'order total/item values must come from catalog price/name';
  END IF;

  replay_id := public.create_widget_order(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Customer',
    '[{"product_id":"11111111-1111-4111-8111-111111111111","quantity":2}]'::jsonb,
    NULL, NULL, NULL, '{}'::jsonb, 'idem-a'
  );
  IF replay_id <> order_id THEN
    RAISE EXCEPTION 'same-tenant idempotent replay must return the existing order';
  END IF;

  caught := false;
  BEGIN
    PERFORM public.create_widget_order(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'Customer',
      '[{"product_id":"11111111-1111-4111-8111-111111111111","quantity":-1}]'::jsonb,
      NULL, NULL, NULL, '{}'::jsonb, 'idem-negative'
    );
  EXCEPTION WHEN OTHERS THEN
    caught := true;
  END;
  IF NOT caught THEN RAISE EXCEPTION 'negative quantity must be rejected'; END IF;

  caught := false;
  BEGIN
    PERFORM public.create_widget_order(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'Customer',
      '[{"product_id":"22222222-2222-4222-8222-222222222222","quantity":1}]'::jsonb,
      NULL, NULL, NULL, '{}'::jsonb, 'idem-foreign'
    );
  EXCEPTION WHEN OTHERS THEN
    caught := true;
  END;
  IF NOT caught THEN RAISE EXCEPTION 'foreign receptionist product must be rejected'; END IF;

  caught := false;
  BEGIN
    PERFORM public.create_widget_order(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'Customer',
      '[{"product_id":"11111111-1111-4111-8111-111111111111","quantity":1}]'::jsonb,
      NULL, NULL, NULL, '{}'::jsonb, 'idem-b'
    );
    -- The idempotency key already belongs to this tenant; the same key is
    -- valid only as an idempotent replay, so this call should replay.
  EXCEPTION WHEN OTHERS THEN
    caught := true;
  END;
  IF caught THEN RAISE EXCEPTION 'same-tenant idempotent replay unexpectedly failed'; END IF;
END $$;
