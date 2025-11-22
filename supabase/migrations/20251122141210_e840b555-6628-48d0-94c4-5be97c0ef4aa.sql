-- Services table for appointment types
CREATE TABLE IF NOT EXISTS public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  receptionist_id uuid REFERENCES public.receptionists(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  duration_minutes int NOT NULL DEFAULT 30,
  buffer_before_minutes int NOT NULL DEFAULT 5,
  buffer_after_minutes int NOT NULL DEFAULT 5,
  active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_services_receptionist ON public.services(receptionist_id);
CREATE INDEX IF NOT EXISTS idx_services_user ON public.services(user_id);

-- Availability rules per receptionist
CREATE TABLE IF NOT EXISTS public.availability_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id uuid NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time text NOT NULL,
  end_time text NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  priority int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_avail_receptionist ON public.availability_rules(receptionist_id);

-- Availability exceptions (holidays, unavailable periods)
CREATE TABLE IF NOT EXISTS public.availability_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id uuid NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  start_timestamptz timestamptz NOT NULL,
  end_timestamptz timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_avail_ex_receptionist ON public.availability_exceptions(receptionist_id);
CREATE INDEX IF NOT EXISTS idx_avail_ex_dates ON public.availability_exceptions(start_timestamptz, end_timestamptz);

-- Enhanced appointments table (check if exists and alter, or create new)
DO $$ 
BEGIN
  -- Add new columns if they don't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='service_id') THEN
    ALTER TABLE public.appointments ADD COLUMN service_id uuid REFERENCES public.services(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='customer_email') THEN
    ALTER TABLE public.appointments ADD COLUMN customer_email text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='booking_source') THEN
    ALTER TABLE public.appointments ADD COLUMN booking_source text DEFAULT 'ai_receptionist';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='created_by') THEN
    ALTER TABLE public.appointments ADD COLUMN created_by uuid;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='metadata') THEN
    ALTER TABLE public.appointments ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Appointment audit logs
CREATE TABLE IF NOT EXISTS public.appointment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  action text NOT NULL,
  actor_id uuid,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointment_logs_app ON public.appointment_logs(appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointment_logs_created ON public.appointment_logs(created_at DESC);

-- RLS Policies for services
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own services" ON public.services
  FOR SELECT USING (
    user_id = auth.uid() OR 
    receptionist_id IN (SELECT id FROM receptionists WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create own services" ON public.services
  FOR INSERT WITH CHECK (
    user_id = auth.uid() OR 
    receptionist_id IN (SELECT id FROM receptionists WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update own services" ON public.services
  FOR UPDATE USING (
    user_id = auth.uid() OR 
    receptionist_id IN (SELECT id FROM receptionists WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete own services" ON public.services
  FOR DELETE USING (
    user_id = auth.uid() OR 
    receptionist_id IN (SELECT id FROM receptionists WHERE user_id = auth.uid())
  );

-- RLS for availability_rules
ALTER TABLE public.availability_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own availability rules" ON public.availability_rules
  FOR ALL USING (
    receptionist_id IN (SELECT id FROM receptionists WHERE user_id = auth.uid())
  );

-- RLS for availability_exceptions
ALTER TABLE public.availability_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own availability exceptions" ON public.availability_exceptions
  FOR ALL USING (
    receptionist_id IN (SELECT id FROM receptionists WHERE user_id = auth.uid())
  );

-- RLS for appointment_logs
ALTER TABLE public.appointment_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own appointment logs" ON public.appointment_logs
  FOR SELECT USING (
    appointment_id IN (
      SELECT id FROM appointments WHERE receptionist_id IN (
        SELECT id FROM receptionists WHERE user_id = auth.uid()
      )
    )
  );