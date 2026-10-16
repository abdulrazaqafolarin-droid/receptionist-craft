-- Make the public widget order RPC use server-owned catalog prices and
-- prevent global idempotency keys from crossing receptionist boundaries.

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
  v_existing_receptionist_id uuid;
  v_total numeric := 0;
  v_item jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_product_id uuid;
  v_product_name text;
  v_unit_price numeric;
  v_quantity integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.receptionists
    WHERE id = p_receptionist_id AND active = true
  ) THEN
    RAISE EXCEPTION 'Invalid or inactive receptionist';
  END IF;

  IF p_customer_name IS NULL OR btrim(p_customer_name) = '' THEN
    RAISE EXCEPTION 'Customer name is required';
  END IF;

  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one catalog product is required';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    IF length(p_idempotency_key) > 200 THEN
      RAISE EXCEPTION 'Idempotency key is too long';
    END IF;

    -- The existing unique index is global, so serialize the key and reject
    -- reuse by a different receptionist instead of returning a foreign order.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));

    SELECT o.id, o.receptionist_id
      INTO v_order_id, v_existing_receptionist_id
    FROM public.orders o
    WHERE o.idempotency_key = p_idempotency_key;

    IF FOUND THEN
      IF v_existing_receptionist_id IS DISTINCT FROM p_receptionist_id THEN
        RAISE EXCEPTION 'Idempotency key already belongs to another receptionist'
          USING ERRCODE = '23505';
      END IF;
      RETURN v_order_id;
    END IF;
  END IF;

  -- Never trust client-supplied product names or prices. Resolve each line
  -- against the active product catalog belonging to this receptionist.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS x(value)
  LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR NULLIF(v_item->>'product_id', '') IS NULL THEN
      RAISE EXCEPTION 'Each order item must include a catalog product_id';
    END IF;

    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := COALESCE(NULLIF(v_item->>'quantity', '')::integer, 1);

    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'Product quantity must be a positive integer';
    END IF;

    SELECT s.name, s.price
      INTO v_product_name, v_unit_price
    FROM public.services s
    WHERE s.id = v_product_id
      AND s.receptionist_id = p_receptionist_id
      AND s.active = true
      AND s.is_product = true
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product is unavailable for this receptionist';
    END IF;

    IF v_unit_price IS NULL OR v_unit_price < 0 THEN
      RAISE EXCEPTION 'Product must have a configured non-negative price';
    END IF;

    v_total := v_total + (v_unit_price * v_quantity);
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id,
      'product_name', v_product_name,
      'quantity', v_quantity,
      'unit_price', v_unit_price
    ));
  END LOOP;

  INSERT INTO public.orders (
    receptionist_id, customer_name, customer_email, customer_phone, notes,
    total_amount, metadata, status, idempotency_key
  ) VALUES (
    p_receptionist_id, btrim(p_customer_name), p_customer_email, p_customer_phone,
    p_notes, v_total, COALESCE(p_metadata, '{}'::jsonb), 'pending', p_idempotency_key
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price)
  SELECT
    v_order_id,
    (line->>'product_id')::uuid,
    line->>'product_name',
    (line->>'quantity')::integer,
    (line->>'unit_price')::numeric
  FROM jsonb_array_elements(v_lines) AS x(line);

  RETURN v_order_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_widget_order(uuid, text, jsonb, text, text, text, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_widget_order(uuid, text, jsonb, text, text, text, jsonb, text)
  TO anon, authenticated, service_role;
