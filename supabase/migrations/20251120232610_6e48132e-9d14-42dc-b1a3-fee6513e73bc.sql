-- Create notifications table for in-app notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receptionist_id UUID REFERENCES public.receptionists(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'kb_suggestion', 'ab_promotion', 'quality_alert', etc.
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT, -- Optional link to related page
  read BOOLEAN NOT NULL DEFAULT false,
  priority TEXT NOT NULL DEFAULT 'normal', -- 'low', 'normal', 'high', 'critical'
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see their own notifications
CREATE POLICY "Users can view own notifications"
  ON public.notifications
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON public.notifications
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert notifications"
  ON public.notifications
  FOR INSERT
  WITH CHECK (true); -- Edge functions with service role can insert

-- Create optimization_log table for tracking A/B test decisions
CREATE TABLE IF NOT EXISTS public.optimization_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_id UUID REFERENCES public.ab_tests(id) ON DELETE CASCADE,
  receptionist_id UUID REFERENCES public.receptionists(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- 'created', 'promoted', 'retired'
  variant_key TEXT,
  decision_reason TEXT,
  metrics_before JSONB,
  metrics_after JSONB,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_optimization_log_test_id ON public.optimization_log(test_id);
CREATE INDEX IF NOT EXISTS idx_optimization_log_created_at ON public.optimization_log(created_at DESC);

-- Enable RLS
ALTER TABLE public.optimization_log ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view optimization logs for their own receptionists
CREATE POLICY "Users can view own optimization logs"
  ON public.optimization_log
  FOR SELECT
  USING (
    receptionist_id IS NULL OR
    EXISTS (
      SELECT 1 FROM receptionists
      WHERE receptionists.id = optimization_log.receptionist_id
        AND receptionists.user_id = auth.uid()
    )
  );

-- Add GIN index for JSONB quality_score in ai_responses (if not exists)
CREATE INDEX IF NOT EXISTS idx_ai_responses_quality_score ON public.ai_responses USING GIN(quality_score);

-- Add index for faster KB rewrite log queries
CREATE INDEX IF NOT EXISTS idx_kb_rewrite_log_auto_suggest ON public.kb_rewrite_log(receptionist_id, auto_suggest) WHERE auto_suggest = true;