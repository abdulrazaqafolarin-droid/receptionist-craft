-- The public widget may submit product IDs and quantities, but it must not
-- choose prices or product names. Derive both from the active product catalog.
CREATE OR REPLACE FUNCTION public.create_widget_order(
  p_receptionist_id uuid,
  p_customer_name text,
  p_items jsonb,
  p_customer_email text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_idempotency_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_order_id uuid;
  v_total numeric := 0;
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_product record;
  v_customer_name text;
  v_idempotency_key text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.receptionists
    WHERE id = p_receptionist_id AND active = true
  ) THEN
    RAISE EXCEPTION 'Invalid or inactive receptionist';
  END IF;

  v_customer_name := btrim(COALESCE(p_customer_name, ''));
  IF v_customer_name = '' OR length(v_customer_name) > 200 THEN
    RAISE EXCEPTION 'Customer name is required and must be at most 200 characters';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) < 1 OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Items must be an array containing 1 to 50 products';
  END IF;

  IF p_notes IS NOT NULL AND length(p_notes) > 2000 THEN
    RAISE EXCEPTION 'Notes must be at most 2000 characters';
  END IF;
  IF p_metadata IS NOT NULL AND jsonb_typeof(p_metadata) <> 'object' THEN
    RAISE EXCEPTION 'Metadata must be a JSON object';
  END IF;

  v_idempotency_key := NULLIF(btrim(p_idempotency_key), '');
  IF v_idempotency_key IS NOT NULL AND length(v_idempotency_key) > 200 THEN
    RAISE EXCEPTION 'Idempotency key must be at most 200 characters';
  END IF;

  -- An idempotency key must never disclose an order belonging to a different
  -- receptionist. The existing unique index may be global, so fail closed if
  -- another tenant already used the key.
  IF v_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_order_id
    FROM public.orders
    WHERE idempotency_key = v_idempotency_key
      AND receptionist_id = p_receptionist_id;
    IF v_order_id IS NOT NULL THEN
      RETURN v_order_id;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.orders WHERE idempotency_key = v_idempotency_key
    ) THEN
      RAISE EXCEPTION 'Idempotency key already used';
    END IF;
  END IF;

  -- Calculate totals from catalog prices only. Client-supplied unit_price and
  -- product_name are intentionally ignored.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS value
  LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'Each item must be an object';
    END IF;

    IF COALESCE(v_item->>'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Each item requires a valid product_id';
    END IF;
    v_product_id := (v_item->>'product_id')::uuid;

    IF v_item->>'quantity' IS NULL THEN
      v_quantity := 1;
    ELSE
      IF (v_item->>'quantity') !~ '^[0-9]{1,4}$' THEN
        RAISE EXCEPTION 'Quantity must be a positive whole number';
      END IF;
      v_quantity := (v_item->>'quantity')::integer;
    END IF;
    IF v_quantity < 1 OR v_quantity > 1000 THEN
      RAISE EXCEPTION 'Quantity must be between 1 and 1000';
    END IF;

    SELECT id, name, price
    INTO v_product
    FROM public.services
    WHERE id = v_product_id
      AND receptionist_id = p_receptionist_id
      AND active IS TRUE
      AND is_product IS TRUE
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid, inactive, or foreign product';
    END IF;
    IF v_product.price IS NULL OR v_product.price < 0 THEN
      RAISE EXCEPTION 'Product price is not configured';
    END IF;

    v_total := v_total + (v_product.price * v_quantity);
  END LOOP;

  BEGIN
    INSERT INTO public.orders (
      receptionist_id, customer_name, customer_email, customer_phone, notes,
      total_amount, metadata, status, idempotency_key
    ) VALUES (
      p_receptionist_id, v_customer_name, p_customer_email, p_customer_phone, p_notes,
      v_total, COALESCE(p_metadata, '{}'::jsonb), 'pending', v_idempotency_key
    )
    RETURNING id INTO v_order_id;
  EXCEPTION WHEN unique_violation THEN
    IF v_idempotency_key IS NOT NULL THEN
      SELECT id INTO v_order_id
      FROM public.orders
      WHERE idempotency_key = v_idempotency_key
        AND receptionist_id = p_receptionist_id;
      IF v_order_id IS NOT NULL THEN
        RETURN v_order_id;
      END IF;
    END IF;
    RAISE;
  END;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS value
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := COALESCE((v_item->>'quantity')::integer, 1);

    SELECT name, price INTO v_product
    FROM public.services
    WHERE id = v_product_id
      AND receptionist_id = p_receptionist_id
      AND active IS TRUE
      AND is_product IS TRUE;

    INSERT INTO public.order_items (
      order_id, product_id, product_name, quantity, unit_price
    ) VALUES (
      v_order_id, v_product_id, v_product.name, v_quantity, v_product.price
    );
  END LOOP;

  RETURN v_order_id;
END;
$function$;
