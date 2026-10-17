-- Harden the public widget booking RPC without disabling public checkout.
-- Customer action tokens remain the public capability for later confirmation/cancel.
CREATE OR REPLACE FUNCTION public.create_widget_appointment(
  p_receptionist_id uuid,
  p_customer_name text,
  p_service text,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_customer_email text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_service_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_booking_source text DEFAULT 'ai_receptionist',
  p_idempotency_key text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(id uuid, cancellation_token text, confirmation_token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_id uuid;
  v_cancel_token text;
  v_confirm_token text;
  v_customer_name text;
  v_service_name text;
  v_idempotency_key text;
  v_booking_source text;
  v_service record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.receptionists
    WHERE id = p_receptionist_id AND active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Invalid or inactive receptionist';
  END IF;

  v_idempotency_key := NULLIF(btrim(p_idempotency_key), '');
  IF v_idempotency_key IS NOT NULL AND length(v_idempotency_key) > 200 THEN
    RAISE EXCEPTION 'Idempotency key must be at most 200 characters';
  END IF;

  -- A global unique key must never return another tenant's appointment ID or
  -- cancellation/confirmation tokens.
  IF v_idempotency_key IS NOT NULL THEN
    SELECT a.id, a.cancellation_token, a.confirmation_token
    INTO v_id, v_cancel_token, v_confirm_token
    FROM public.appointments a
    WHERE a.idempotency_key = v_idempotency_key
      AND a.receptionist_id = p_receptionist_id;

    IF v_id IS NOT NULL THEN
      RETURN QUERY SELECT v_id, v_cancel_token, v_confirm_token;
      RETURN;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.idempotency_key = v_idempotency_key
    ) THEN
      RAISE EXCEPTION 'Idempotency key already used';
    END IF;
  END IF;

  v_customer_name := btrim(COALESCE(p_customer_name, ''));
  IF v_customer_name = '' OR length(v_customer_name) > 200 THEN
    RAISE EXCEPTION 'Customer name is required and must be at most 200 characters';
  END IF;

  IF p_start_time IS NULL OR p_end_time IS NULL OR p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'Appointment end time must be after start time';
  END IF;
  IF p_start_time < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'Appointment start time cannot be in the past';
  END IF;

  IF p_customer_email IS NOT NULL AND length(p_customer_email) > 320 THEN
    RAISE EXCEPTION 'Customer email is too long';
  END IF;
  IF p_customer_phone IS NOT NULL AND length(p_customer_phone) > 50 THEN
    RAISE EXCEPTION 'Customer phone is too long';
  END IF;
  IF p_notes IS NOT NULL AND length(p_notes) > 2000 THEN
    RAISE EXCEPTION 'Notes must be at most 2000 characters';
  END IF;
  IF p_metadata IS NOT NULL AND jsonb_typeof(p_metadata) <> 'object' THEN
    RAISE EXCEPTION 'Metadata must be a JSON object';
  END IF;

  v_booking_source := COALESCE(NULLIF(btrim(p_booking_source), ''), 'ai_receptionist');
  IF length(v_booking_source) > 80 THEN
    RAISE EXCEPTION 'Booking source is too long';
  END IF;

  -- If a catalog service ID is provided, it must belong to this receptionist
  -- and be an active non-product service. Store the canonical service name.
  IF p_service_id IS NOT NULL THEN
    SELECT s.name, s.active, s.is_product
    INTO v_service
    FROM public.services s
    WHERE s.id = p_service_id
      AND s.receptionist_id = p_receptionist_id
    FOR SHARE;

    IF NOT FOUND OR v_service.active IS NOT TRUE OR COALESCE(v_service.is_product, false) THEN
      RAISE EXCEPTION 'Invalid, inactive, or foreign service';
    END IF;
    v_service_name := v_service.name;
  ELSE
    v_service_name := btrim(COALESCE(p_service, ''));
    IF v_service_name = '' OR length(v_service_name) > 200 THEN
      RAISE EXCEPTION 'Service is required and must be at most 200 characters';
    END IF;
  END IF;

  v_cancel_token := encode(gen_random_bytes(32), 'hex');
  v_confirm_token := encode(gen_random_bytes(32), 'hex');

  BEGIN
    INSERT INTO public.appointments (
      receptionist_id, customer_name, service, start_time, end_time,
      customer_email, customer_phone, service_id, notes, booking_source,
      idempotency_key, cancellation_token, confirmation_token, metadata, status
    ) VALUES (
      p_receptionist_id, v_customer_name, v_service_name, p_start_time, p_end_time,
      p_customer_email, p_customer_phone, p_service_id, p_notes, v_booking_source,
      v_idempotency_key, v_cancel_token, v_confirm_token, COALESCE(p_metadata, '{}'::jsonb), 'booked'
    )
    RETURNING appointments.id, appointments.cancellation_token, appointments.confirmation_token
    INTO v_id, v_cancel_token, v_confirm_token;
  EXCEPTION WHEN unique_violation THEN
    IF v_idempotency_key IS NOT NULL THEN
      SELECT a.id, a.cancellation_token, a.confirmation_token
      INTO v_id, v_cancel_token, v_confirm_token
      FROM public.appointments a
      WHERE a.idempotency_key = v_idempotency_key
        AND a.receptionist_id = p_receptionist_id;
      IF v_id IS NOT NULL THEN
        RETURN QUERY SELECT v_id, v_cancel_token, v_confirm_token;
        RETURN;
      END IF;
    END IF;
    RAISE;
  END;

  RETURN QUERY SELECT v_id, v_cancel_token, v_confirm_token;
END;
$function$;
