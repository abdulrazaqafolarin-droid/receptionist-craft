-- Add missing kb_rewrite_log table for KB rewrite audit trail
CREATE TABLE IF NOT EXISTS public.kb_rewrite_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id uuid REFERENCES public.receptionists(id) ON DELETE CASCADE,
  user_id uuid NULL,
  original jsonb,
  rewritten jsonb,
  changes jsonb,
  reason text,
  auto_suggest boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_rewrite_receptionist ON public.kb_rewrite_log(receptionist_id);

-- Add model column to receptionists if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'receptionists' 
                 AND column_name = 'model') THEN
    ALTER TABLE public.receptionists ADD COLUMN model text DEFAULT 'google/gemini-2.5-flash';
  END IF;
END $$;

-- Add missing indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_messages_receptionist_created_at 
  ON public.chat_messages(receptionist_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_metadata 
  ON public.chat_messages USING gin(metadata);
CREATE INDEX IF NOT EXISTS idx_ai_responses_receptionist_created_at 
  ON public.ai_responses(receptionist_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_responses_flagged 
  ON public.ai_responses(flagged);
CREATE INDEX IF NOT EXISTS idx_analytics_cache_user 
  ON public.analytics_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_ab_assignments_test_user 
  ON public.ab_assignments(test_id, user_id);

-- Add RLS policies for kb_rewrite_log
ALTER TABLE public.kb_rewrite_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own KB rewrite logs"
  ON public.kb_rewrite_log
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM receptionists
    WHERE receptionists.id = kb_rewrite_log.receptionist_id
    AND receptionists.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own KB rewrite logs"
  ON public.kb_rewrite_log
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM receptionists
    WHERE receptionists.id = kb_rewrite_log.receptionist_id
    AND receptionists.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own KB rewrite logs"
  ON public.kb_rewrite_log
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM receptionists
    WHERE receptionists.id = kb_rewrite_log.receptionist_id
    AND receptionists.user_id = auth.uid()
  ));