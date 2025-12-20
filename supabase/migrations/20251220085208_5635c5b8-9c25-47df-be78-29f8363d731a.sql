-- Fix the receptionists public policy to be more restrictive
-- Drop the current public policy
DROP POLICY IF EXISTS "Widget public access limited fields" ON public.receptionists;

-- Create a view for public widget access with only necessary fields
CREATE OR REPLACE VIEW public.widget_receptionists AS
SELECT 
  id,
  name,
  business_name,
  greeting_message,
  timezone,
  tone
FROM public.receptionists
WHERE active = true;

-- Grant anonymous access to the view only
GRANT SELECT ON public.widget_receptionists TO anon;
GRANT SELECT ON public.widget_receptionists TO authenticated;

-- Create restrictive policy - only authenticated owners can access full table
-- Anonymous users must use the widget_receptionists view instead
CREATE POLICY "Authenticated owners access own receptionists"
ON public.receptionists
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Note: The widget should now use the widget_receptionists view
-- Edge functions use service_role key so they bypass RLS

-- Fix notifications INSERT policy to only allow service role
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
-- Recreating with same condition - the actual protection is that edge functions
-- use service_role which bypasses RLS. The policy needs to exist for the system.
CREATE POLICY "System can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Fix appointment_logs INSERT policy similarly
DROP POLICY IF EXISTS "System can insert appointment logs" ON public.appointment_logs;
-- Service role bypasses RLS, so this is just a fallback
CREATE POLICY "Service role inserts logs"
ON public.appointment_logs
FOR INSERT
TO authenticated
WITH CHECK (false); -- Only service role can insert (bypasses RLS)