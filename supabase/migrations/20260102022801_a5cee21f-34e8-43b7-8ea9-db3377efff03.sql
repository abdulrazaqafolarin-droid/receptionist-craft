-- Add business_model column to receptionists table
ALTER TABLE public.receptionists 
ADD COLUMN IF NOT EXISTS business_model text DEFAULT 'services' CHECK (business_model IN ('services', 'products', 'both'));