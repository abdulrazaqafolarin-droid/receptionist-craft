-- ═══════════════════════════════════════════════════════════════════════════
-- ADD BUSINESS CAPABILITY GRAPH COLUMNS TO RECEPTIONISTS
-- This enables intent-driven, capability-based AI behavior instead of rigid templates
-- ═══════════════════════════════════════════════════════════════════════════

-- Add capabilities JSONB column with default values
ALTER TABLE public.receptionists
ADD COLUMN IF NOT EXISTS capabilities jsonb DEFAULT '{
  "sells_products": false,
  "books_appointments": true,
  "offers_services": true,
  "delivers": false,
  "requires_compliance": false,
  "supports_emergency": false
}'::jsonb;

-- Add primary_goal column for business intent optimization
ALTER TABLE public.receptionists
ADD COLUMN IF NOT EXISTS primary_goal text DEFAULT 'bookings'
CHECK (primary_goal IN ('sales', 'bookings', 'support', 'leads'));

-- Add comment explaining the capability graph
COMMENT ON COLUMN public.receptionists.capabilities IS 
'Business Capability Graph: JSON object defining what the business can do. Used by AI to adapt flows dynamically. Keys: sells_products, books_appointments, offers_services, delivers, requires_compliance, supports_emergency';

COMMENT ON COLUMN public.receptionists.primary_goal IS 
'Primary business goal that biases AI behavior: sales (product-focused), bookings (appointment-focused), support (information/help-focused), leads (contact capture-focused)';

-- Create function to auto-detect capabilities from business_type
CREATE OR REPLACE FUNCTION public.auto_detect_capabilities(business_type text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  CASE business_type
    -- Appointment-heavy businesses
    WHEN 'Dental Clinic', 'Medical Clinic', 'Spa & Wellness', 'Barber Shop', 'Hair Salon', 'Law Office' THEN
      RETURN '{"sells_products": false, "books_appointments": true, "offers_services": true, "delivers": false, "requires_compliance": true, "supports_emergency": false}'::jsonb;
    
    -- Product-heavy businesses  
    WHEN 'Grocery Store', 'Electronics Store', 'Retail Store', 'Auto Parts', 'Bakery' THEN
      RETURN '{"sells_products": true, "books_appointments": false, "offers_services": false, "delivers": true, "requires_compliance": false, "supports_emergency": false}'::jsonb;
    
    -- Service-on-demand businesses
    WHEN 'Car Wash', 'Gym & Fitness', 'Florist' THEN
      RETURN '{"sells_products": false, "books_appointments": true, "offers_services": true, "delivers": false, "requires_compliance": false, "supports_emergency": false}'::jsonb;
    
    -- Hybrid businesses
    WHEN 'Pharmacy' THEN
      RETURN '{"sells_products": true, "books_appointments": true, "offers_services": true, "delivers": true, "requires_compliance": true, "supports_emergency": true}'::jsonb;
    
    WHEN 'Restaurant' THEN
      RETURN '{"sells_products": true, "books_appointments": true, "offers_services": false, "delivers": true, "requires_compliance": false, "supports_emergency": false}'::jsonb;
    
    WHEN 'Pet Shop' THEN
      RETURN '{"sells_products": true, "books_appointments": true, "offers_services": true, "delivers": true, "requires_compliance": false, "supports_emergency": false}'::jsonb;
    
    WHEN 'Real Estate' THEN
      RETURN '{"sells_products": false, "books_appointments": true, "offers_services": true, "delivers": false, "requires_compliance": true, "supports_emergency": false}'::jsonb;
    
    -- Default: hybrid capability
    ELSE
      RETURN '{"sells_products": true, "books_appointments": true, "offers_services": true, "delivers": false, "requires_compliance": false, "supports_emergency": false}'::jsonb;
  END CASE;
END;
$$;

-- Create function to auto-detect primary goal from business_type
CREATE OR REPLACE FUNCTION public.auto_detect_primary_goal(business_type text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  CASE business_type
    -- Appointment-focused
    WHEN 'Dental Clinic', 'Medical Clinic', 'Spa & Wellness', 'Barber Shop', 'Hair Salon', 'Law Office', 'Real Estate' THEN
      RETURN 'bookings';
    
    -- Sales-focused
    WHEN 'Grocery Store', 'Electronics Store', 'Retail Store', 'Auto Parts', 'Bakery', 'Pharmacy', 'Pet Shop', 'Florist' THEN
      RETURN 'sales';
    
    -- Hybrid/Restaurant
    WHEN 'Restaurant' THEN
      RETURN 'bookings';
    
    -- Service businesses
    WHEN 'Car Wash', 'Gym & Fitness' THEN
      RETURN 'bookings';
    
    ELSE
      RETURN 'support';
  END CASE;
END;
$$;