-- STEP 1: Add ai_mode to receptionists table for Money Mode support
-- Add ai_mode enum type
CREATE TYPE public.ai_mode AS ENUM ('support', 'booking', 'sales');

-- Add ai_mode column to receptionists with default 'booking'
ALTER TABLE public.receptionists 
ADD COLUMN ai_mode public.ai_mode NOT NULL DEFAULT 'booking';

-- STEP 4: Create conversion_events table for tracking revenue actions
CREATE TABLE public.conversion_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('booking_completed', 'lead_captured', 'checkout_initiated', 'order_completed')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.conversion_events ENABLE ROW LEVEL SECURITY;

-- RLS policies for conversion_events
CREATE POLICY "Users can view their own conversion events" 
ON public.conversion_events 
FOR SELECT 
USING (
  receptionist_id IN (
    SELECT id FROM public.receptionists WHERE user_id = auth.uid()
  )
);

CREATE POLICY "System can insert conversion events" 
ON public.conversion_events 
FOR INSERT 
WITH CHECK (true);

-- Create index for efficient queries
CREATE INDEX idx_conversion_events_receptionist ON public.conversion_events(receptionist_id);
CREATE INDEX idx_conversion_events_type ON public.conversion_events(event_type);
CREATE INDEX idx_conversion_events_created_at ON public.conversion_events(created_at DESC);

-- Add comment for documentation
COMMENT ON COLUMN public.receptionists.ai_mode IS 'AI behavior mode: support (answer questions), booking (guide to appointments), sales (actively drive conversions)';