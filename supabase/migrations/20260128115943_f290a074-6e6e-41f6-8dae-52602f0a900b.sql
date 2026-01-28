
-- =====================================================
-- DATABASE SECURITY HARDENING MIGRATION
-- Replace all permissive RLS policies with proper access controls
-- =====================================================

-- 1. Create SECURITY DEFINER functions for edge function inserts
-- These allow edge functions using service_role to safely insert records

-- Function to insert booking suggestions (for AI system)
CREATE OR REPLACE FUNCTION public.insert_booking_suggestion(
  p_receptionist_id uuid,
  p_request_message text,
  p_suggestions jsonb,
  p_model text DEFAULT NULL,
  p_latency_ms integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Verify receptionist exists and is active
  IF NOT EXISTS (SELECT 1 FROM receptionists WHERE id = p_receptionist_id AND active = true) THEN
    RAISE EXCEPTION 'Invalid or inactive receptionist';
  END IF;
  
  INSERT INTO ai_booking_suggestions (receptionist_id, request_message, suggestions, model, latency_ms)
  VALUES (p_receptionist_id, p_request_message, p_suggestions, p_model, p_latency_ms)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- Function to insert conversion events (for AI system)
CREATE OR REPLACE FUNCTION public.insert_conversion_event(
  p_receptionist_id uuid,
  p_session_id text,
  p_event_type text,
  p_revenue_value numeric DEFAULT 0,
  p_currency text DEFAULT 'NGN',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Verify receptionist exists and is active
  IF NOT EXISTS (SELECT 1 FROM receptionists WHERE id = p_receptionist_id AND active = true) THEN
    RAISE EXCEPTION 'Invalid or inactive receptionist';
  END IF;
  
  -- Validate session_id is provided
  IF p_session_id IS NULL OR p_session_id = '' THEN
    RAISE EXCEPTION 'Session ID is required';
  END IF;
  
  INSERT INTO conversion_events (receptionist_id, session_id, event_type, revenue_value, currency, metadata)
  VALUES (p_receptionist_id, p_session_id, p_event_type, p_revenue_value, p_currency, p_metadata)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- Function to manage conversation state (for AI system)
CREATE OR REPLACE FUNCTION public.upsert_conversation_state(
  p_receptionist_id uuid,
  p_session_id text,
  p_active_flow text DEFAULT NULL,
  p_active_topic text DEFAULT NULL,
  p_flow_step text DEFAULT NULL,
  p_topic_confidence double precision DEFAULT 0,
  p_slots jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Verify receptionist exists and is active
  IF NOT EXISTS (SELECT 1 FROM receptionists WHERE id = p_receptionist_id AND active = true) THEN
    RAISE EXCEPTION 'Invalid or inactive receptionist';
  END IF;
  
  -- Validate session_id
  IF p_session_id IS NULL OR p_session_id = '' THEN
    RAISE EXCEPTION 'Session ID is required';
  END IF;
  
  INSERT INTO conversation_state (receptionist_id, session_id, active_flow, active_topic, flow_step, topic_confidence, slots, last_message_at)
  VALUES (p_receptionist_id, p_session_id, p_active_flow, p_active_topic, p_flow_step, p_topic_confidence, p_slots, now())
  ON CONFLICT (receptionist_id, session_id) 
  DO UPDATE SET 
    active_flow = COALESCE(EXCLUDED.active_flow, conversation_state.active_flow),
    active_topic = COALESCE(EXCLUDED.active_topic, conversation_state.active_topic),
    flow_step = COALESCE(EXCLUDED.flow_step, conversation_state.flow_step),
    topic_confidence = EXCLUDED.topic_confidence,
    slots = EXCLUDED.slots,
    last_message_at = now()
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- Function to manage conversation summaries (for AI system)
CREATE OR REPLACE FUNCTION public.upsert_conversation_summary(
  p_receptionist_id uuid,
  p_session_id text,
  p_summary text,
  p_key_facts jsonb DEFAULT '{}'::jsonb,
  p_user_fingerprint text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Verify receptionist exists and is active
  IF NOT EXISTS (SELECT 1 FROM receptionists WHERE id = p_receptionist_id AND active = true) THEN
    RAISE EXCEPTION 'Invalid or inactive receptionist';
  END IF;
  
  -- Validate session_id
  IF p_session_id IS NULL OR p_session_id = '' THEN
    RAISE EXCEPTION 'Session ID is required';
  END IF;
  
  INSERT INTO conversation_summaries (receptionist_id, session_id, summary, key_facts, user_fingerprint, last_updated)
  VALUES (p_receptionist_id, p_session_id, p_summary, p_key_facts, p_user_fingerprint, now())
  ON CONFLICT (receptionist_id, session_id) 
  DO UPDATE SET 
    summary = EXCLUDED.summary,
    key_facts = EXCLUDED.key_facts,
    user_fingerprint = COALESCE(EXCLUDED.user_fingerprint, conversation_summaries.user_fingerprint),
    last_updated = now()
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- Function to create appointments from widget (for AI/edge functions)
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
RETURNS TABLE(
  id uuid,
  cancellation_token text,
  confirmation_token text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_cancel_token text;
  v_confirm_token text;
BEGIN
  -- Verify receptionist exists and is active
  IF NOT EXISTS (SELECT 1 FROM receptionists WHERE id = p_receptionist_id AND active = true) THEN
    RAISE EXCEPTION 'Invalid or inactive receptionist';
  END IF;
  
  -- Validate required fields
  IF p_customer_name IS NULL OR p_customer_name = '' THEN
    RAISE EXCEPTION 'Customer name is required';
  END IF;
  
  IF p_service IS NULL OR p_service = '' THEN
    RAISE EXCEPTION 'Service is required';
  END IF;
  
  -- Generate tokens
  v_cancel_token := encode(gen_random_bytes(32), 'hex');
  v_confirm_token := encode(gen_random_bytes(32), 'hex');
  
  -- Check for idempotency
  IF p_idempotency_key IS NOT NULL THEN
    SELECT a.id, a.cancellation_token, a.confirmation_token 
    INTO v_id, v_cancel_token, v_confirm_token
    FROM appointments a 
    WHERE a.idempotency_key = p_idempotency_key;
    
    IF v_id IS NOT NULL THEN
      RETURN QUERY SELECT v_id, v_cancel_token, v_confirm_token;
      RETURN;
    END IF;
  END IF;
  
  INSERT INTO appointments (
    receptionist_id, customer_name, service, start_time, end_time,
    customer_email, customer_phone, service_id, notes, booking_source,
    idempotency_key, cancellation_token, confirmation_token, metadata, status
  )
  VALUES (
    p_receptionist_id, p_customer_name, p_service, p_start_time, p_end_time,
    p_customer_email, p_customer_phone, p_service_id, p_notes, p_booking_source,
    p_idempotency_key, v_cancel_token, v_confirm_token, p_metadata, 'booked'
  )
  RETURNING appointments.id, appointments.cancellation_token, appointments.confirmation_token
  INTO v_id, v_cancel_token, v_confirm_token;
  
  RETURN QUERY SELECT v_id, v_cancel_token, v_confirm_token;
END;
$$;

-- Function to create orders from widget (for AI/edge functions)
CREATE OR REPLACE FUNCTION public.create_widget_order(
  p_receptionist_id uuid,
  p_customer_name text,
  p_items jsonb,
  p_customer_email text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_total numeric := 0;
  v_item jsonb;
BEGIN
  -- Verify receptionist exists and is active
  IF NOT EXISTS (SELECT 1 FROM receptionists WHERE id = p_receptionist_id AND active = true) THEN
    RAISE EXCEPTION 'Invalid or inactive receptionist';
  END IF;
  
  -- Validate required fields
  IF p_customer_name IS NULL OR p_customer_name = '' THEN
    RAISE EXCEPTION 'Customer name is required';
  END IF;
  
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one item is required';
  END IF;
  
  -- Calculate total
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_total := v_total + COALESCE((v_item->>'unit_price')::numeric, 0) * COALESCE((v_item->>'quantity')::integer, 1);
  END LOOP;
  
  -- Create order
  INSERT INTO orders (receptionist_id, customer_name, customer_email, customer_phone, notes, total_amount, metadata, status)
  VALUES (p_receptionist_id, p_customer_name, p_customer_email, p_customer_phone, p_notes, v_total, p_metadata, 'pending')
  RETURNING id INTO v_order_id;
  
  -- Create order items
  INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price)
  SELECT 
    v_order_id,
    (item->>'product_id')::uuid,
    item->>'product_name',
    COALESCE((item->>'quantity')::integer, 1),
    (item->>'unit_price')::numeric
  FROM jsonb_array_elements(p_items) AS item;
  
  RETURN v_order_id;
END;
$$;

-- 2. Add unique constraint for conversation_state upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'conversation_state_receptionist_session_unique'
  ) THEN
    ALTER TABLE conversation_state 
    ADD CONSTRAINT conversation_state_receptionist_session_unique 
    UNIQUE (receptionist_id, session_id);
  END IF;
END $$;

-- Add unique constraint for conversation_summaries upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'conversation_summaries_receptionist_session_unique'
  ) THEN
    ALTER TABLE conversation_summaries 
    ADD CONSTRAINT conversation_summaries_receptionist_session_unique 
    UNIQUE (receptionist_id, session_id);
  END IF;
END $$;

-- 3. Drop all permissive policies and replace with secure ones

-- === ai_booking_suggestions ===
DROP POLICY IF EXISTS "System can insert booking suggestions" ON ai_booking_suggestions;

CREATE POLICY "Business owners can view their booking suggestions"
ON ai_booking_suggestions FOR SELECT
TO authenticated
USING (
  receptionist_id IN (
    SELECT id FROM receptionists WHERE user_id = auth.uid()
  )
);

-- Inserts are now done via insert_booking_suggestion() SECURITY DEFINER function

-- === conversion_events ===
DROP POLICY IF EXISTS "System can insert conversion events" ON conversion_events;

CREATE POLICY "Business owners can view their conversion events"
ON conversion_events FOR SELECT
TO authenticated
USING (
  receptionist_id IN (
    SELECT id FROM receptionists WHERE user_id = auth.uid()
  )
);

-- Inserts are now done via insert_conversion_event() SECURITY DEFINER function

-- === conversation_state ===
DROP POLICY IF EXISTS "Service role can manage conversation state" ON conversation_state;

CREATE POLICY "Business owners can view conversation state"
ON conversation_state FOR SELECT
TO authenticated
USING (
  receptionist_id IN (
    SELECT id FROM receptionists WHERE user_id = auth.uid()
  )
);

-- All mutations are now done via upsert_conversation_state() SECURITY DEFINER function

-- === conversation_summaries ===
DROP POLICY IF EXISTS "Service role can manage summaries" ON conversation_summaries;

-- Keep existing policy for business owner read access, remove the permissive one
-- The "Receptionist owners can view their summaries" policy already exists

-- All mutations are now done via upsert_conversation_summary() SECURITY DEFINER function

-- === appointments (bookings) ===
-- Add session-based access for widget users to view their own bookings

CREATE POLICY "Widget users can view their session appointments"
ON appointments FOR SELECT
TO anon
USING (
  -- Allow if the session_id in metadata matches the request header
  (metadata->>'session_id') = (current_setting('request.headers', true)::json->>'x-session-id')
);

-- Widget inserts are done via create_widget_appointment() SECURITY DEFINER function

-- === orders ===
-- Add session-based access for widget users

CREATE POLICY "Widget users can view their session orders"
ON orders FOR SELECT
TO anon
USING (
  -- Allow if the session_id in metadata matches the request header
  (metadata->>'session_id') = (current_setting('request.headers', true)::json->>'x-session-id')
);

-- Widget inserts are done via create_widget_order() SECURITY DEFINER function

-- === order_items ===
-- Add session-based access via parent order

CREATE POLICY "Widget users can view their session order items"
ON order_items FOR SELECT
TO anon
USING (
  order_id IN (
    SELECT id FROM orders 
    WHERE (metadata->>'session_id') = (current_setting('request.headers', true)::json->>'x-session-id')
  )
);

-- 4. Harden chat_messages policies
-- The existing policy is good but let's ensure session isolation

DROP POLICY IF EXISTS "Widget users can read own session messages" ON chat_messages;

CREATE POLICY "Widget users can read own session messages"
ON chat_messages FOR SELECT
TO anon, authenticated
USING (
  -- Session-based access for widget users
  (session_id IS NOT NULL AND session_id = (current_setting('request.headers', true)::json->>'x-session-id'))
  OR
  -- Business owner access
  (EXISTS (
    SELECT 1 FROM receptionists 
    WHERE receptionists.id = chat_messages.receptionist_id 
    AND receptionists.user_id = auth.uid()
  ))
);

-- 5. Grant execute permissions on SECURITY DEFINER functions
GRANT EXECUTE ON FUNCTION public.insert_booking_suggestion TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.insert_conversion_event TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_conversation_state TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_conversation_summary TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_widget_appointment TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_widget_order TO anon, authenticated, service_role;

-- 6. Create index for session-based lookups
CREATE INDEX IF NOT EXISTS idx_appointments_session_id ON appointments ((metadata->>'session_id'));
CREATE INDEX IF NOT EXISTS idx_orders_session_id ON orders ((metadata->>'session_id'));
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages (session_id);
