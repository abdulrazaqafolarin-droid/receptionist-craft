
-- Create atomic stock deduction function to prevent race conditions
CREATE OR REPLACE FUNCTION public.deduct_stock(
  p_product_id UUID,
  p_quantity INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_qty INT;
  v_new_qty INT;
BEGIN
  -- Lock the row to prevent concurrent modifications
  SELECT stock_quantity INTO v_current_qty
  FROM services
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Product not found');
  END IF;

  IF v_current_qty IS NULL OR v_current_qty < p_quantity THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Insufficient stock: %s available, %s requested', COALESCE(v_current_qty, 0), p_quantity),
      'available', COALESCE(v_current_qty, 0)
    );
  END IF;

  v_new_qty := v_current_qty - p_quantity;

  UPDATE services
  SET stock_quantity = v_new_qty
  WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'success', true,
    'previous_qty', v_current_qty,
    'new_qty', v_new_qty
  );
END;
$$;
