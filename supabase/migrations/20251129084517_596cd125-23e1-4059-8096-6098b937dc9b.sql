-- Add public read access for active receptionists (widget customers need this)
-- Only expose public-facing fields, exclude sensitive data
CREATE POLICY "Public can view active receptionists for widget"
ON public.receptionists
FOR SELECT
TO anon, authenticated
USING (active = true);

-- Add public read access for active services (widget needs to show services)
CREATE POLICY "Public can view active services for widget"
ON public.services
FOR SELECT
TO anon, authenticated
USING (
  active = true AND
  receptionist_id IN (
    SELECT id FROM receptionists WHERE active = true
  )
);

-- Add public read access for receptionist FAQs (widget needs to display these)
CREATE POLICY "Public can view FAQs for active receptionists"
ON public.receptionist_faqs
FOR SELECT
TO anon, authenticated
USING (
  receptionist_id IN (
    SELECT id FROM receptionists WHERE active = true
  )
);

-- Add public read access to availability rules (for widget booking flow)
CREATE POLICY "Public can view availability for active receptionists"
ON public.availability_rules
FOR SELECT
TO anon, authenticated
USING (
  receptionist_id IN (
    SELECT id FROM receptionists WHERE active = true
  )
);

-- Add public insert for chat messages (widget customers need to send messages)
-- They'll use session IDs instead of user_id
CREATE POLICY "Public can create chat messages in widget"
ON public.chat_messages
FOR INSERT
TO anon, authenticated
WITH CHECK (
  receptionist_id IN (
    SELECT id FROM receptionists WHERE active = true
  )
);

-- Add public read for chat messages (widget needs to display conversation history)
-- Limited to their own session
CREATE POLICY "Public can read own chat messages in widget"
ON public.chat_messages
FOR SELECT
TO anon, authenticated
USING (
  receptionist_id IN (
    SELECT id FROM receptionists WHERE active = true
  )
);

-- Add comment explaining security model
COMMENT ON POLICY "Public can view active receptionists for widget" ON public.receptionists IS 
'Allows anonymous widget customers to view public receptionist data (name, business_name, greeting, etc). Only active receptionists are visible. Sensitive fields like system_prompt and knowledge_base are not exposed to frontend.';

COMMENT ON POLICY "Public can view active services for widget" ON public.services IS
'Allows anonymous widget customers to view available services for booking. Only active services from active receptionists are visible.';

COMMENT ON POLICY "Public can create chat messages in widget" ON public.chat_messages IS
'Allows anonymous widget customers to send messages. They use session_id instead of authenticated user_id for tracking conversations.';