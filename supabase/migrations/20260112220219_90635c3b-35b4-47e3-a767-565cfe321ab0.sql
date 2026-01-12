-- Create conversation_summaries table for long-term memory
CREATE TABLE IF NOT EXISTS conversation_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id uuid NOT NULL REFERENCES receptionists(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  user_fingerprint text,
  summary text NOT NULL,
  key_facts jsonb NOT NULL DEFAULT '{}',
  last_updated timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_receptionist_session 
ON conversation_summaries(receptionist_id, session_id);

CREATE INDEX IF NOT EXISTS idx_conversation_summaries_user_fingerprint 
ON conversation_summaries(user_fingerprint);

-- Add RLS
ALTER TABLE conversation_summaries ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can insert/update (edge functions)
CREATE POLICY "Service role can manage summaries" 
ON conversation_summaries 
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Policy: Receptionist owners can view their summaries
CREATE POLICY "Receptionist owners can view their summaries" 
ON conversation_summaries 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM receptionists 
    WHERE receptionists.id = conversation_summaries.receptionist_id 
    AND receptionists.user_id = auth.uid()
  )
);

-- Create conversation_state table for topic and flow tracking
CREATE TABLE IF NOT EXISTS conversation_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id uuid NOT NULL REFERENCES receptionists(id) ON DELETE CASCADE,
  session_id text NOT NULL UNIQUE,
  active_flow text CHECK (active_flow IN ('SERVICE', 'PRODUCT', NULL)),
  active_topic text,
  flow_step text,
  topic_confidence float DEFAULT 0,
  slots jsonb DEFAULT '{}',
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_conversation_state_session 
ON conversation_state(session_id);

-- Add RLS
ALTER TABLE conversation_state ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can manage state
CREATE POLICY "Service role can manage conversation state" 
ON conversation_state 
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Create function to cleanup old conversation state
CREATE OR REPLACE FUNCTION cleanup_old_conversation_state(retention_days integer DEFAULT 7)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM conversation_state 
  WHERE last_message_at < NOW() - (retention_days || ' days')::interval;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;