-- ============================================
-- APPOINTMENT BOOKING SYSTEM MIGRATIONS
-- Safe, non-destructive additions
-- ============================================

-- Add customer contact fields (IF NOT EXISTS)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'appointments' AND column_name = 'customer_email') THEN
    ALTER TABLE appointments ADD COLUMN customer_email TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'appointments' AND column_name = 'customer_phone') THEN
    ALTER TABLE appointments ADD COLUMN customer_phone TEXT;
  END IF;
END $$;

-- Add idempotency key for duplicate prevention
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'appointments' AND column_name = 'idempotency_key') THEN
    ALTER TABLE appointments ADD COLUMN idempotency_key TEXT;
  END IF;
END $$;

-- Add secure tokens for public confirm/cancel
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'appointments' AND column_name = 'cancellation_token') THEN
    ALTER TABLE appointments ADD COLUMN cancellation_token TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'appointments' AND column_name = 'confirmation_token') THEN
    ALTER TABLE appointments ADD COLUMN confirmation_token TEXT;
  END IF;
END $$;

-- Create indexes for performance (IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_appointments_start_time') THEN
    CREATE INDEX idx_appointments_start_time ON appointments(start_time);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_appointments_status') THEN
    CREATE INDEX idx_appointments_status ON appointments(status);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_appointments_idempotency') THEN
    CREATE INDEX idx_appointments_idempotency ON appointments(idempotency_key) WHERE idempotency_key IS NOT NULL;
  END IF;
END $$;

-- Ensure appointment_logs table exists
CREATE TABLE IF NOT EXISTS appointment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_id UUID,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for appointment_logs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_appointment_logs_appointment_id') THEN
    CREATE INDEX idx_appointment_logs_appointment_id ON appointment_logs(appointment_id);
  END IF;
END $$;

-- Enable RLS for appointment_logs if not already enabled
ALTER TABLE appointment_logs ENABLE ROW LEVEL SECURITY;

-- RLS policy for appointment_logs (users can view own logs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'appointment_logs' 
    AND policyname = 'Users can view own appointment logs'
  ) THEN
    CREATE POLICY "Users can view own appointment logs" ON appointment_logs
      FOR SELECT
      USING (
        appointment_id IN (
          SELECT id FROM appointments 
          WHERE receptionist_id IN (
            SELECT id FROM receptionists WHERE user_id = auth.uid()
          )
        )
      );
  END IF;
END $$;

-- System can insert logs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'appointment_logs' 
    AND policyname = 'System can insert appointment logs'
  ) THEN
    CREATE POLICY "System can insert appointment logs" ON appointment_logs
      FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;