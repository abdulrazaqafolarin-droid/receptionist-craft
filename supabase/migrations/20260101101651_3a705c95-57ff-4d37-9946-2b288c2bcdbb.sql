-- Add price column to services table for both services and products
ALTER TABLE public.services 
ADD COLUMN IF NOT EXISTS price numeric DEFAULT NULL;

-- Add a comment to clarify usage
COMMENT ON COLUMN public.services.price IS 'Price in dollars. Optional for services, typically set for products.';

-- Create an index for price-based queries
CREATE INDEX IF NOT EXISTS idx_services_price ON public.services (price) WHERE price IS NOT NULL;