-- Rutex FrontDesk canonical schema (safe migrations - IF NOT EXISTS)
-- Created: 2025-11-20
-- Purpose: ensure analytics, AB testing, KB logging, and AI telemetry tables exist

-- profiles (basic, non-destructive - only create if missing)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  full_name text,
  created_at timestamptz DEFAULT now()
);

-- Add full_name column to profiles if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'profiles' 
                 AND column_name = 'full_name') THEN
    ALTER TABLE public.profiles ADD COLUMN full_name text;
  END IF;
END $$;

-- Add updated_at column to receptionists if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'receptionists' 
                 AND column_name = 'updated_at') THEN
    ALTER TABLE public.receptionists ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Ensure model column exists (already added in previous migration)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'receptionists' 
                 AND column_name = 'model') THEN
    ALTER TABLE public.receptionists ADD COLUMN model text DEFAULT 'google/gemini-2.5-flash';
  END IF;
END $$;

-- Add indexes for receptionists
CREATE INDEX IF NOT EXISTS idx_receptionists_user_id ON public.receptionists(user_id);
CREATE INDEX IF NOT EXISTS idx_receptionists_phone ON public.receptionists(phone);

-- Add indexes for receptionist_faqs
CREATE INDEX IF NOT EXISTS idx_faqs_receptionist_id ON public.receptionist_faqs(receptionist_id);

-- Add indexes for chat_messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_receptionist_created_at ON public.chat_messages(receptionist_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_metadata ON public.chat_messages USING gin(metadata);

-- Add indexes for ai_responses
CREATE INDEX IF NOT EXISTS idx_ai_responses_receptionist_created_at ON public.ai_responses(receptionist_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_responses_flagged ON public.ai_responses(flagged);

-- Add indexes for analytics_cache
CREATE INDEX IF NOT EXISTS idx_analytics_cache_user ON public.analytics_cache(user_id);

-- Ensure analytics_cache has receptionist_id column
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'analytics_cache' 
                 AND column_name = 'receptionist_id') THEN
    ALTER TABLE public.analytics_cache ADD COLUMN receptionist_id uuid REFERENCES public.receptionists(id) ON DELETE CASCADE;
  END IF;
END $$;

-- AB testing tables already exist, ensure active column on ab_tests
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'ab_tests' 
                 AND column_name = 'active') THEN
    ALTER TABLE public.ab_tests ADD COLUMN active boolean DEFAULT true;
  END IF;
END $$;

-- Ensure ab_variants has created_at
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'ab_variants' 
                 AND column_name = 'created_at') THEN
    ALTER TABLE public.ab_variants ADD COLUMN created_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Add indexes for ab_assignments
CREATE INDEX IF NOT EXISTS idx_ab_assignments_test_user ON public.ab_assignments(test_id, user_id);

-- kb_rewrite_log already created in previous migration
CREATE INDEX IF NOT EXISTS idx_kb_rewrite_receptionist ON public.kb_rewrite_log(receptionist_id);

-- usage_logs table
CREATE TABLE IF NOT EXISTS public.usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  receptionist_id uuid NULL,
  type text,
  cost_numeric numeric,
  tokens_used int,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

-- Ensure usage_logs has compatible columns with existing structure
DO $$ 
BEGIN
  -- Add cost_numeric if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'usage_logs' 
                 AND column_name = 'cost_numeric') THEN
    ALTER TABLE public.usage_logs ADD COLUMN cost_numeric numeric;
  END IF;
  
  -- Add tokens_used if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'usage_logs' 
                 AND column_name = 'tokens_used') THEN
    ALTER TABLE public.usage_logs ADD COLUMN tokens_used int;
  END IF;
  
  -- Add details if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'usage_logs' 
                 AND column_name = 'details') THEN
    ALTER TABLE public.usage_logs ADD COLUMN details jsonb;
  END IF;
  
  -- Add receptionist_id if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'usage_logs' 
                 AND column_name = 'receptionist_id') THEN
    ALTER TABLE public.usage_logs ADD COLUMN receptionist_id uuid NULL;
  END IF;
END $$;