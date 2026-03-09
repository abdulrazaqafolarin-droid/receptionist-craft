-- Fix currency default from NGN to USD in conversion_events table
ALTER TABLE public.conversion_events 
  ALTER COLUMN currency SET DEFAULT 'USD'::text;

-- Ensure receptionists.currency defaults to USD (already exists with 'USD' default per schema)
-- No change needed there as it already defaults correctly