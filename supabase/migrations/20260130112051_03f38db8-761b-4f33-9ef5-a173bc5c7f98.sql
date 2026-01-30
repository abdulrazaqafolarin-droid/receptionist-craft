-- STEP 2: Lock down services table
-- Remove any existing permissive policies and enforce owner-only access

-- Drop existing policies on services
DROP POLICY IF EXISTS "Users can manage their services" ON services;
DROP POLICY IF EXISTS "Public can view services" ON services;
DROP POLICY IF EXISTS "Anyone can view active services" ON services;
DROP POLICY IF EXISTS "Authenticated users can manage services" ON services;

-- Ensure RLS is enabled
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

-- Business owners can fully manage their own services
CREATE POLICY "Business owners can manage their services"
ON services
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Create SECURITY DEFINER function for widget to read services
-- This allows edge functions to fetch services for a receptionist without public RLS
CREATE OR REPLACE FUNCTION public.get_services_for_receptionist(p_receptionist_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  duration_minutes integer,
  price numeric,
  active boolean,
  is_product boolean,
  stock_quantity integer,
  buffer_before_minutes integer,
  buffer_after_minutes integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    s.id,
    s.name,
    s.description,
    s.duration_minutes,
    s.price,
    s.active,
    s.is_product,
    s.stock_quantity,
    s.buffer_before_minutes,
    s.buffer_after_minutes
  FROM services s
  WHERE s.receptionist_id = p_receptionist_id
    AND s.active = true;
$$;

-- Grant execute to anon for widget access via edge functions
GRANT EXECUTE ON FUNCTION public.get_services_for_receptionist(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_services_for_receptionist(uuid) TO authenticated;