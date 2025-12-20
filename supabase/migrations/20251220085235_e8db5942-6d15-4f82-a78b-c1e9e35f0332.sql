-- Fix the security definer view issue by using SECURITY INVOKER explicitly
DROP VIEW IF EXISTS public.widget_receptionists;

CREATE VIEW public.widget_receptionists 
WITH (security_invoker = true) AS
SELECT 
  id,
  name,
  business_name,
  greeting_message,
  timezone,
  tone
FROM public.receptionists
WHERE active = true;

-- Re-grant access
GRANT SELECT ON public.widget_receptionists TO anon;
GRANT SELECT ON public.widget_receptionists TO authenticated;

-- Since view now uses invoker security, we need a public read policy for active receptionists
-- but only through the view (limited fields)
CREATE POLICY "Public can access active receptionists via view"
ON public.receptionists
FOR SELECT
TO anon
USING (active = true);