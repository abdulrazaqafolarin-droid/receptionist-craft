-- Add stock_quantity column for inventory tracking on products
ALTER TABLE public.services
ADD COLUMN IF NOT EXISTS stock_quantity integer DEFAULT NULL;

-- Add is_product column to clearly distinguish products from services
ALTER TABLE public.services
ADD COLUMN IF NOT EXISTS is_product boolean DEFAULT false;

-- Add low_stock_threshold for notifications
ALTER TABLE public.services
ADD COLUMN IF NOT EXISTS low_stock_threshold integer DEFAULT 5;

-- Create index for quick product lookups
CREATE INDEX IF NOT EXISTS idx_services_is_product ON public.services(receptionist_id, is_product) WHERE active = true;

-- Create index for low stock queries
CREATE INDEX IF NOT EXISTS idx_services_low_stock ON public.services(receptionist_id, stock_quantity, low_stock_threshold) WHERE is_product = true AND active = true;

COMMENT ON COLUMN public.services.stock_quantity IS 'Current stock quantity for products (NULL = unlimited/not tracked)';
COMMENT ON COLUMN public.services.is_product IS 'True if this is a product, false if it is a service';
COMMENT ON COLUMN public.services.low_stock_threshold IS 'Alert threshold for low stock notifications';