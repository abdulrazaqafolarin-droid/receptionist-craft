-- Create AI responses / analytics table
CREATE TABLE IF NOT EXISTS public.ai_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id uuid REFERENCES public.receptionists(id) ON DELETE CASCADE,
  user_id uuid NULL,
  request_message text,
  reply_text text,
  model text,
  latency_ms int NULL,
  temperature numeric NULL,
  quality_score jsonb NULL,
  confidence numeric NULL,
  channel text NULL,
  flagged boolean DEFAULT false,
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_responses_receptionist_created_at ON public.ai_responses(receptionist_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_responses_flagged ON public.ai_responses(flagged);

-- Enable RLS on ai_responses
ALTER TABLE public.ai_responses ENABLE ROW LEVEL SECURITY;

-- RLS policies for ai_responses
CREATE POLICY "Users can view own ai_responses"
  ON public.ai_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM receptionists
      WHERE receptionists.id = ai_responses.receptionist_id
      AND receptionists.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own ai_responses"
  ON public.ai_responses FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM receptionists
      WHERE receptionists.id = ai_responses.receptionist_id
      AND receptionists.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own ai_responses"
  ON public.ai_responses FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM receptionists
      WHERE receptionists.id = ai_responses.receptionist_id
      AND receptionists.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own ai_responses"
  ON public.ai_responses FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM receptionists
      WHERE receptionists.id = ai_responses.receptionist_id
      AND receptionists.user_id = auth.uid()
    )
  );

-- Create A/B testing tables
CREATE TABLE IF NOT EXISTS public.ab_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  start_at timestamptz,
  end_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ab_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid REFERENCES public.ab_tests(id) ON DELETE CASCADE,
  key text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  weight int DEFAULT 100
);

CREATE TABLE IF NOT EXISTS public.ab_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid REFERENCES public.ab_tests(id) ON DELETE CASCADE,
  user_id uuid NULL,
  receptionist_id uuid NULL,
  variant_key text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on A/B testing tables
ALTER TABLE public.ab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_assignments ENABLE ROW LEVEL SECURITY;

-- RLS policies for ab_tests (read-only for all authenticated users)
CREATE POLICY "Authenticated users can view ab_tests"
  ON public.ab_tests FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- RLS policies for ab_variants (read-only for all authenticated users)
CREATE POLICY "Authenticated users can view ab_variants"
  ON public.ab_variants FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- RLS policies for ab_assignments
CREATE POLICY "Users can view own ab_assignments"
  ON public.ab_assignments FOR SELECT
  USING (user_id = auth.uid() OR receptionist_id IN (
    SELECT id FROM receptionists WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own ab_assignments"
  ON public.ab_assignments FOR INSERT
  WITH CHECK (user_id = auth.uid() OR receptionist_id IN (
    SELECT id FROM receptionists WHERE user_id = auth.uid()
  ));

-- Create reviews table
CREATE TABLE IF NOT EXISTS public.ai_response_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_response_id uuid REFERENCES public.ai_responses(id) ON DELETE CASCADE,
  reviewer_id uuid NULL,
  note text,
  action_taken text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on reviews
ALTER TABLE public.ai_response_reviews ENABLE ROW LEVEL SECURITY;

-- RLS policies for reviews
CREATE POLICY "Users can view own reviews"
  ON public.ai_response_reviews FOR SELECT
  USING (
    reviewer_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM ai_responses ar
      JOIN receptionists r ON r.id = ar.receptionist_id
      WHERE ar.id = ai_response_reviews.ai_response_id
      AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own reviews"
  ON public.ai_response_reviews FOR INSERT
  WITH CHECK (reviewer_id = auth.uid());

CREATE POLICY "Users can update own reviews"
  ON public.ai_response_reviews FOR UPDATE
  USING (reviewer_id = auth.uid());

CREATE POLICY "Users can delete own reviews"
  ON public.ai_response_reviews FOR DELETE
  USING (reviewer_id = auth.uid());