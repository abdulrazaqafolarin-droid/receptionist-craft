CREATE POLICY "Public can view available slots for active receptionists"
ON public.appointment_slots
FOR SELECT
USING (
  is_available = true
  AND receptionist_id IN (
    SELECT id FROM receptionists WHERE active = true
  )
);