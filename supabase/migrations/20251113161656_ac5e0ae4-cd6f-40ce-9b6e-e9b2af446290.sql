-- Add missing columns to receptionists table
ALTER TABLE public.receptionists 
ADD COLUMN IF NOT EXISTS business_type text,
ADD COLUMN IF NOT EXISTS business_info jsonb DEFAULT '{}'::jsonb;