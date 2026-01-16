-- Drop the view and recreate with security_invoker
DROP VIEW IF EXISTS public.revenue_attribution;

CREATE VIEW public.revenue_attribution
WITH (security_invoker = on) AS
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