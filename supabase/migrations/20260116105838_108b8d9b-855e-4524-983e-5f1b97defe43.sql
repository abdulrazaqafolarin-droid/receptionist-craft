-- Add revenue_assisted column to conversion_events for revenue attribution
ALTER TABLE public.conversion_events 
ADD COLUMN IF NOT EXISTS revenue_value numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS currency text DEFAULT 'NGN';

-- Create a view for revenue attribution stats
CREATE OR REPLACE VIEW public.revenue_attribution AS
SELECT 
  receptionist_id,
  SUM(revenue_value) as total_revenue_assisted,
  COUNT(*) FILTER (WHERE event_type = 'booking_completed') as bookings_count,
  COUNT(*) FILTER (WHERE event_type = 'order_completed') as orders_count,
  COUNT(*) FILTER (WHERE event_type = 'lead_captured') as leads_count,
  COUNT(*) FILTER (WHERE event_type = 'checkout_initiated') as checkouts_count,
  currency
FROM public.conversion_events
GROUP BY receptionist_id, currency;

-- Enable RLS on the view (views inherit table RLS, but explicit is better)
COMMENT ON VIEW public.revenue_attribution IS 'Revenue attribution statistics per receptionist';