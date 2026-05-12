-- ============================================
-- ADD IDEMPOTENCY CONSTRAINTS
-- Prevents duplicate bookings/orders at DB level
-- ============================================

-- 1. Add UNIQUE constraint on appointments.idempotency_key (partial, to allow NULLs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_appointments_idempotency_unique'
  ) THEN
    CREATE UNIQUE INDEX CONCURRENTLY idx_appointments_idempotency_unique
    ON appointments(idempotency_key)
    WHERE idempotency_key IS NOT NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not create unique index: %', SQLERRM;
END $$;

-- 2. Add idempotency_key to orders table (safe, IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'idempotency_key'
  ) THEN
    ALTER TABLE orders ADD COLUMN idempotency_key TEXT;
  END IF;
END $$;

-- 3. Index for fast idempotency lookups on orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_orders_idempotency'
  ) THEN
    CREATE INDEX idx_orders_idempotency ON orders(idempotency_key) WHERE idempotency_key IS NOT NULL;
  END IF;
END $$;

-- 4. UNIQUE constraint on orders.idempotency_key (partial)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_orders_idempotency_unique'
  ) THEN
    CREATE UNIQUE INDEX CONCURRENTLY idx_orders_idempotency_unique
    ON orders(idempotency_key)
    WHERE idempotency_key IS NOT NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not create unique index: %', SQLERRM;
END $$;

-- 5. Update create_widget_order RPC to accept and check idempotency_key
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
AS $$
DECLARE
  v_order_id uuid;
  v_total numeric := 0;
  v_item jsonb;
BEGIN
  -- Verify receptionist exists and is active
  IF NOT EXISTS (SELECT 1 FROM receptionists WHERE id = p_receptionist_id AND active = true) THEN
    RAISE EXCEPTION 'Invalid or inactive receptionist';
  END IF;
  
  -- Validate required fields
  IF p_customer_name IS NULL OR p_customer_name = '' THEN
    RAISE EXCEPTION 'Customer name is required';
  END IF;
  
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one item is required';
  END IF;
  
  -- IDEMPOTENCY CHECK: Return existing order if idempotency_key matches
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_order_id
    FROM orders
    WHERE idempotency_key = p_idempotency_key;
    
    IF v_order_id IS NOT NULL THEN
      RETURN v_order_id;
    END IF;
  END IF;
  
  -- Calculate total
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_total := v_total + COALESCE((v_item->>'unit_price')::numeric, 0) * COALESCE((v_item->>'quantity')::integer, 1);
  END LOOP;
  
  -- Create order with idempotency_key
  INSERT INTO orders (receptionist_id, customer_name, customer_email, customer_phone, notes, total_amount, metadata, status, idempotency_key)
  VALUES (p_receptionist_id, p_customer_name, p_customer_email, p_customer_phone, p_notes, v_total, p_metadata, 'pending', p_idempotency_key)
  RETURNING id INTO v_order_id;
  
  -- Create order items
  INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price)
  SELECT 
    v_order_id,
    (item->>'product_id')::uuid,
    item->>'product_name',
    COALESCE((item->>'quantity')::integer, 1),
    (item->>'unit_price')::numeric
  FROM jsonb_array_elements(p_items) AS item;
  
  RETURN v_order_id;
END;
$$;
