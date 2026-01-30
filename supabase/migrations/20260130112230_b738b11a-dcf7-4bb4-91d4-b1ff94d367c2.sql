-- STEP 3: Create public catalog view for widget access
-- Widget reads from this view ONLY - no direct table access

-- Create the public catalog view with security_invoker for proper RLS
CREATE OR REPLACE VIEW public.public_catalog
WITH (security_invoker = off) AS
SELECT 
  s.id,
  s.receptionist_id,
  s.name,
  s.description,
  s.duration_minutes,
  s.price,
  s.is_product,
  -- Only show "in stock" status, not actual quantity
  CASE 
    WHEN s.is_product = true AND s.stock_quantity IS NOT NULL 
    THEN s.stock_quantity > 0
    ELSE true
  END as in_stock,
  s.buffer_before_minutes,
  s.buffer_after_minutes
FROM services s
WHERE s.active = true;

-- Allow public/anon to SELECT from the view
GRANT SELECT ON public.public_catalog TO anon;
GRANT SELECT ON public.public_catalog TO authenticated;

-- Create RLS policy on the view (views inherit from base table by default with security_invoker)
-- Since security_invoker is OFF, the view runs with definer privileges
-- This means anon can read the view even though they can't read the base table