-- Add explicit deny policies for anonymous access to sensitive tables
-- This prevents any anonymous API calls from accessing PII

-- Deny anonymous access to profiles (contains emails)
CREATE POLICY "Deny anonymous access to profiles"
ON public.profiles
FOR SELECT
TO anon
USING (false);

-- Deny anonymous access to appointments (contains customer PII)
CREATE POLICY "Deny anonymous access to appointments"
ON public.appointments
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- Deny anonymous access to usage_logs (contains billing data)
CREATE POLICY "Deny anonymous access to usage_logs"
ON public.usage_logs
FOR SELECT
TO anon
USING (false);

-- Deny anonymous access to integrations (contains sensitive configs)
CREATE POLICY "Deny anonymous access to integrations"
ON public.integrations
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- Deny anonymous access to analytics_cache
CREATE POLICY "Deny anonymous access to analytics_cache"
ON public.analytics_cache
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- Deny anonymous access to kb_rewrite_log
CREATE POLICY "Deny anonymous access to kb_rewrite_log"
ON public.kb_rewrite_log
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- Deny anonymous access to ai_responses
CREATE POLICY "Deny anonymous access to ai_responses"
ON public.ai_responses
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- Deny anonymous access to ai_response_reviews
CREATE POLICY "Deny anonymous access to ai_response_reviews"
ON public.ai_response_reviews
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- Deny anonymous access to optimization_log
CREATE POLICY "Deny anonymous access to optimization_log"
ON public.optimization_log
FOR SELECT
TO anon
USING (false);

-- Deny anonymous access to conversations (except widget needs access via edge functions with service role)
CREATE POLICY "Deny anonymous access to conversations"
ON public.conversations
FOR SELECT
TO anon
USING (false);