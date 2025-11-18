-- Migration 0001: Add phone column to receptionists table
-- This adds a phone column and syncs it with business_phone for compatibility

-- Add phone column
ALTER TABLE public.receptionists 
ADD COLUMN IF NOT EXISTS phone text;

-- Initialize phone from business_phone where it exists
UPDATE public.receptionists 
SET phone = business_phone 
WHERE phone IS NULL AND business_phone IS NOT NULL;

-- Create trigger function to keep phone and business_phone in sync
CREATE OR REPLACE FUNCTION sync_receptionist_phones()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If phone is updated, sync to business_phone
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    NEW.business_phone := NEW.phone;
  END IF;
  
  -- If business_phone is updated, sync to phone
  IF NEW.business_phone IS DISTINCT FROM OLD.business_phone THEN
    NEW.phone := NEW.business_phone;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to auto-sync phone fields
DROP TRIGGER IF EXISTS sync_receptionist_phones_trigger ON public.receptionists;
CREATE TRIGGER sync_receptionist_phones_trigger
BEFORE UPDATE ON public.receptionists
FOR EACH ROW
EXECUTE FUNCTION sync_receptionist_phones();

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_receptionists_phone ON public.receptionists(phone);