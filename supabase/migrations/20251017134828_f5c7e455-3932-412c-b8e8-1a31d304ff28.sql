-- Create enum for user plan
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_plan') THEN
    CREATE TYPE public.user_plan AS ENUM ('free', 'pro', 'enterprise');
  END IF;
END $$;

-- Create enum for receptionist tone
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'receptionist_tone') THEN
    CREATE TYPE public.receptionist_tone AS ENUM ('friendly', 'professional', 'playful');
  END IF;
END $$;

-- Create enum for appointment status
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appointment_status') THEN
    CREATE TYPE public.appointment_status AS ENUM ('booked', 'cancelled', 'completed');
  END IF;
END $$;

-- Create enum for integration type
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'integration_type') THEN
    CREATE TYPE public.integration_type AS ENUM ('twilio', 'openai', 'google_calendar', 'stripe');
  END IF;
END $$;

-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  plan public.user_plan DEFAULT 'free' NOT NULL,
  timezone TEXT DEFAULT 'UTC',
  onboarding_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
  CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
  CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
END $$;

-- Create receptionists table
CREATE TABLE IF NOT EXISTS public.receptionists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  business_name TEXT NOT NULL,
  business_phone TEXT,
  timezone TEXT DEFAULT 'UTC',
  language TEXT DEFAULT 'English',
  tone public.receptionist_tone DEFAULT 'friendly',
  persona_description TEXT,
  greeting_message TEXT,
  hours_of_operation JSONB DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  mock_mode BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS on receptionists
ALTER TABLE public.receptionists ENABLE ROW LEVEL SECURITY;

-- Receptionists policies
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view own receptionists" ON public.receptionists;
  CREATE POLICY "Users can view own receptionists" ON public.receptionists FOR SELECT USING (auth.uid() = user_id);
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can create own receptionists" ON public.receptionists;
  CREATE POLICY "Users can create own receptionists" ON public.receptionists FOR INSERT WITH CHECK (auth.uid() = user_id);
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can update own receptionists" ON public.receptionists;
  CREATE POLICY "Users can update own receptionists" ON public.receptionists FOR UPDATE USING (auth.uid() = user_id);
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can delete own receptionists" ON public.receptionists;
  CREATE POLICY "Users can delete own receptionists" ON public.receptionists FOR DELETE USING (auth.uid() = user_id);
END $$;

-- Create receptionist_faqs table
CREATE TABLE IF NOT EXISTS public.receptionist_faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id UUID REFERENCES public.receptionists(id) ON DELETE CASCADE NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS on receptionist_faqs
ALTER TABLE public.receptionist_faqs ENABLE ROW LEVEL SECURITY;

-- FAQ policies
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view own receptionist FAQs" ON public.receptionist_faqs;
  CREATE POLICY "Users can view own receptionist FAQs"
    ON public.receptionist_faqs FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.receptionists
        WHERE receptionists.id = receptionist_faqs.receptionist_id
        AND receptionists.user_id = auth.uid()
      )
    );
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can create own receptionist FAQs" ON public.receptionist_faqs;
  CREATE POLICY "Users can create own receptionist FAQs"
    ON public.receptionist_faqs FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.receptionists
        WHERE receptionists.id = receptionist_faqs.receptionist_id
        AND receptionists.user_id = auth.uid()
      )
    );
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can update own receptionist FAQs" ON public.receptionist_faqs;
  CREATE POLICY "Users can update own receptionist FAQs"
    ON public.receptionist_faqs FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM public.receptionists
        WHERE receptionists.id = receptionist_faqs.receptionist_id
        AND receptionists.user_id = auth.uid()
      )
    );
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can delete own receptionist FAQs" ON public.receptionist_faqs;
  CREATE POLICY "Users can delete own receptionist FAQs"
    ON public.receptionist_faqs FOR DELETE
    USING (
      EXISTS (
        SELECT 1 FROM public.receptionists
        WHERE receptionists.id = receptionist_faqs.receptionist_id
        AND receptionists.user_id = auth.uid()
      )
    );
END $$;

-- Create conversations table
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id UUID REFERENCES public.receptionists(id) ON DELETE CASCADE NOT NULL,
  user_message TEXT NOT NULL,
  bot_message TEXT NOT NULL,
  direction TEXT DEFAULT 'inbound',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS on conversations
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Conversations policies
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view own conversations" ON public.conversations;
  CREATE POLICY "Users can view own conversations"
    ON public.conversations FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.receptionists
        WHERE receptionists.id = conversations.receptionist_id
        AND receptionists.user_id = auth.uid()
      )
    );
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
  CREATE POLICY "Users can create conversations"
    ON public.conversations FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.receptionists
        WHERE receptionists.id = conversations.receptionist_id
        AND receptionists.user_id = auth.uid()
      )
    );
END $$;

-- Create appointments table
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id UUID REFERENCES public.receptionists(id) ON DELETE CASCADE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  service TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status public.appointment_status DEFAULT 'booked',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS on appointments
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Appointments policies
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view own appointments" ON public.appointments;
  CREATE POLICY "Users can view own appointments"
    ON public.appointments FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.receptionists
        WHERE receptionists.id = appointments.receptionist_id
        AND receptionists.user_id = auth.uid()
      )
    );
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can create appointments" ON public.appointments;
  CREATE POLICY "Users can create appointments"
    ON public.appointments FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.receptionists
        WHERE receptionists.id = appointments.receptionist_id
        AND receptionists.user_id = auth.uid()
      )
    );
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can update own appointments" ON public.appointments;
  CREATE POLICY "Users can update own appointments"
    ON public.appointments FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM public.receptionists
        WHERE receptionists.id = appointments.receptionist_id
        AND receptionists.user_id = auth.uid()
      )
    );
END $$;

-- Create integrations table
CREATE TABLE IF NOT EXISTS public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type public.integration_type NOT NULL,
  config_json JSONB DEFAULT '{}',
  enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, type)
);

-- Enable RLS on integrations
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

-- Integrations policies
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view own integrations" ON public.integrations;
  CREATE POLICY "Users can view own integrations" ON public.integrations FOR SELECT USING (auth.uid() = user_id);
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can create own integrations" ON public.integrations;
  CREATE POLICY "Users can create own integrations" ON public.integrations FOR INSERT WITH CHECK (auth.uid() = user_id);
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can update own integrations" ON public.integrations;
  CREATE POLICY "Users can update own integrations" ON public.integrations FOR UPDATE USING (auth.uid() = user_id);
END $$;

-- Create usage_logs table
CREATE TABLE IF NOT EXISTS public.usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  usage_type TEXT NOT NULL,
  minutes_used NUMERIC DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS on usage_logs
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

-- Usage logs policies
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view own usage logs" ON public.usage_logs;
  CREATE POLICY "Users can view own usage logs" ON public.usage_logs FOR SELECT USING (auth.uid() = user_id);
END $$;

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', '')
  );
  RETURN NEW;
END;
$$;

-- Trigger to create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
