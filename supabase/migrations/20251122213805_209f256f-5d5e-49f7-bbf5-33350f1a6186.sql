-- Add metadata jsonb column to appointments and chat_messages if missing
-- Add appointment_logs table if missing

ALTER TABLE IF EXISTS public.appointments
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS public.chat_messages
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- appointment_logs table
CREATE TABLE IF NOT EXISTS public.appointment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  action text NOT NULL,
  actor_id uuid NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointment_logs_appointment ON public.appointment_logs(appointment_id);

-- Enable RLS on appointment_logs
ALTER TABLE public.appointment_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (safe approach)
DROP POLICY IF EXISTS "Users can view own appointment logs" ON public.appointment_logs;
DROP POLICY IF EXISTS "System can insert appointment logs" ON public.appointment_logs;

-- Create policies
CREATE POLICY "Users can view own appointment logs" ON public.appointment_logs
  FOR SELECT USING (
    appointment_id IN (
      SELECT id FROM public.appointments WHERE receptionist_id IN (
        SELECT id FROM public.receptionists WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "System can insert appointment logs" ON public.appointment_logs
  FOR INSERT WITH CHECK (true);