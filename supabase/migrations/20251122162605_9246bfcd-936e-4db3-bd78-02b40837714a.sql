-- Add appointment_slots for caching available slots
CREATE TABLE IF NOT EXISTS public.appointment_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id uuid NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  is_available boolean NOT NULL DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointment_slots_receptionist_start 
  ON public.appointment_slots (receptionist_id, start_time);

-- AI booking suggestions for traceability and analytics
CREATE TABLE IF NOT EXISTS public.ai_booking_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id uuid NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  request_message text NOT NULL,
  suggestions jsonb NOT NULL,
  model text,
  latency_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_booking_suggestions_receptionist 
  ON public.ai_booking_suggestions (receptionist_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.appointment_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_booking_suggestions ENABLE ROW LEVEL SECURITY;

-- RLS policies for appointment_slots
CREATE POLICY "Users can view own appointment slots"
  ON public.appointment_slots FOR SELECT
  USING (receptionist_id IN (
    SELECT id FROM public.receptionists WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can manage own appointment slots"
  ON public.appointment_slots FOR ALL
  USING (receptionist_id IN (
    SELECT id FROM public.receptionists WHERE user_id = auth.uid()
  ));

-- RLS policies for ai_booking_suggestions
CREATE POLICY "Users can view own booking suggestions"
  ON public.ai_booking_suggestions FOR SELECT
  USING (receptionist_id IN (
    SELECT id FROM public.receptionists WHERE user_id = auth.uid()
  ));

CREATE POLICY "System can insert booking suggestions"
  ON public.ai_booking_suggestions FOR INSERT
  WITH CHECK (true);