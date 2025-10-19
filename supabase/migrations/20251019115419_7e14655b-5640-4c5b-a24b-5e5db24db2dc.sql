-- Add missing fields to receptionists table for business memory
ALTER TABLE public.receptionists 
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS website TEXT,
ADD COLUMN IF NOT EXISTS services_and_prices JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS default_response TEXT;

-- Update hours_of_operation to be more flexible if needed (already exists as jsonb)
COMMENT ON COLUMN public.receptionists.services_and_prices IS 'Array of {service, price} objects';
COMMENT ON COLUMN public.receptionists.hours_of_operation IS 'Business hours - flexible text or structured JSON';