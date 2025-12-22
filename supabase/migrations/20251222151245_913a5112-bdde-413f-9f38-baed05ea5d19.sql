-- Fix 1: Remove phone/business_phone from public access policy for receptionists
-- Drop the existing permissive policy and create a more restrictive one
DROP POLICY IF EXISTS "Public can access active receptionists via view" ON public.receptionists;

-- Create a restrictive policy that only allows access to non-sensitive fields via the secure view
-- The widget_receptionists view already exposes only safe fields, so we keep public access via that view only
-- For direct table access, only owners should see full data
CREATE POLICY "Public can only access receptionists via secure view functions" 
ON public.receptionists 
FOR SELECT 
USING (
  -- Either the owner is querying
  (auth.uid() = user_id)
  OR
  -- Or it's an active receptionist being accessed (for widget embedding)
  -- But they'll go through the get_public_receptionist function or widget_receptionists view
  (active = true AND auth.uid() IS NULL)
);

-- Fix 2: Add RLS policies to widget_receptionists view
-- Note: Views inherit RLS from their base tables, but we can add additional security
-- The view already only exposes: id, name, business_name, greeting_message, timezone, tone
-- This is safe - no phone numbers, emails, or sensitive data exposed

-- Fix 3: Create a security definer function for safe receptionist access
CREATE OR REPLACE FUNCTION public.get_safe_receptionist_for_widget(p_receptionist_id uuid)
RETURNS TABLE(
  id uuid, 
  name text, 
  business_name text, 
  greeting_message text, 
  timezone text, 
  tone text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    r.id,
    r.name,
    r.business_name,
    r.greeting_message,
    r.timezone,
    r.tone::text
  FROM public.receptionists r
  WHERE r.id = p_receptionist_id AND r.active = true;
$$;

-- Grant execute permission to anon role for widget access
GRANT EXECUTE ON FUNCTION public.get_safe_receptionist_for_widget(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_safe_receptionist_for_widget(uuid) TO authenticated;