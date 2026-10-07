-- Phase C: internal operators (inside-the-business helpers that sell nothing).
--
-- 1. business_model gains 'internal'. Front-desk models keep their meaning;
--    'internal' means the operator moves no money and books nothing.
ALTER TABLE receptionists DROP CONSTRAINT IF EXISTS receptionists_business_model_check;
ALTER TABLE receptionists ADD CONSTRAINT receptionists_business_model_check
  CHECK (business_model IN ('services', 'products', 'both', 'internal'));

-- 2. services gain expiry_date for stock/expiry tracking (the pharmacy
--    pattern: drugs expiring on the shelf). NULL = not perishable.
ALTER TABLE services ADD COLUMN IF NOT EXISTS expiry_date date DEFAULT NULL;
