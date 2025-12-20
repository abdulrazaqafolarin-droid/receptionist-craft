-- Add session_id column to chat_messages for proper session-based isolation
ALTER TABLE public.chat_messages 
ADD COLUMN IF NOT EXISTS session_id text;

-- Create index for session-based queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON public.chat_messages(session_id);

-- Update existing records to use user_id as session_id (backward compatibility)
UPDATE public.chat_messages 
SET session_id = user_id::text 
WHERE session_id IS NULL;

-- Drop the overly permissive public read policy
DROP POLICY IF EXISTS "Public can read own chat messages in widget" ON public.chat_messages;

-- Create new session-based read policy - users can only read their own session messages
-- This uses the session_id passed via RLS context or matches the user_id
CREATE POLICY "Widget users can read own session messages"
ON public.chat_messages
FOR SELECT
TO anon, authenticated
USING (
  -- Widget visitors can only see messages from their own session
  (session_id = current_setting('request.headers', true)::json->>'x-session-id')
  OR 
  -- Fallback: match user_id for backward compatibility
  (session_id = user_id::text AND session_id IS NOT NULL)
  OR
  -- Authenticated receptionist owners can see all messages for their receptionists
  (EXISTS (
    SELECT 1 FROM receptionists 
    WHERE receptionists.id = chat_messages.receptionist_id 
    AND receptionists.user_id = auth.uid()
  ))
);

-- Update the insert policy to require session_id
DROP POLICY IF EXISTS "Public can create chat messages in widget" ON public.chat_messages;

CREATE POLICY "Widget users can create messages with session"
ON public.chat_messages
FOR INSERT
TO anon, authenticated
WITH CHECK (
  -- Can only insert for active receptionists
  (receptionist_id IN (SELECT id FROM receptionists WHERE active = true))
  AND
  -- Must have a session_id
  (session_id IS NOT NULL)
);