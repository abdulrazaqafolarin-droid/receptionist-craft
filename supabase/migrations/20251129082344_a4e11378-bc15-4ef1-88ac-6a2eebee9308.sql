-- Add customer contact columns and indices if they do not already exist
-- Non-destructive: uses IF NOT EXISTS where supported

-- 1) Add customer_email and customer_phone if missing
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'customer_email') 
  THEN
    ALTER TABLE public.appointments ADD COLUMN customer_email text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'customer_phone') 
  THEN
    ALTER TABLE public.appointments ADD COLUMN customer_phone text;
  END IF;

  -- 2) Add google_event_id (nullable) to store external calendar id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'google_event_id') 
  THEN
    ALTER TABLE public.appointments ADD COLUMN google_event_id text;
  END IF;

  -- 3) Add idempotency_key to appointments (nullable)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'idempotency_key') 
  THEN
    ALTER TABLE public.appointments ADD COLUMN idempotency_key text;
  END IF;
END $$;

-- 4) Add indexes to speed availability queries
CREATE INDEX IF NOT EXISTS idx_appointments_start_time ON public.appointments (start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments (status);