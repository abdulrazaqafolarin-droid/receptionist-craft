-- Restrict maintenance/security-definer RPCs to trusted callers.
-- The live function definitions were inspected read-only before preparing this migration.
-- Apply only after migration-history reconciliation and staging verification.

-- Cleanup routines are maintenance-only. They delete rows across tenants and
-- must never be callable by public/ordinary authenticated clients.
REVOKE ALL ON FUNCTION public.cleanup_old_booking_suggestions(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_old_chat_messages(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_old_conversation_state(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_old_conversations(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_booking_suggestions(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_chat_messages(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_conversation_state(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_conversations(integer) TO service_role;

-- Keep the maintenance routines safe from temporary-schema object shadowing.
ALTER FUNCTION public.cleanup_old_booking_suggestions(integer) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.cleanup_old_chat_messages(integer) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.cleanup_old_conversation_state(integer) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.cleanup_old_conversations(integer) SET search_path = pg_catalog, public, pg_temp;

-- Inventory deduction is an internal order-processing primitive, not a public
-- RPC. Reject non-positive quantities even when called by a trusted server.
CREATE OR REPLACE FUNCTION public.deduct_stock(p_product_id uuid, p_quantity integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_current_qty integer;
  v_new_qty integer;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Quantity must be a positive integer'
    );
  END IF;

  SELECT stock_quantity INTO v_current_qty
  FROM public.services
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Product not found');
  END IF;

  IF v_current_qty IS NULL OR v_current_qty < p_quantity THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Insufficient stock: %s available, %s requested', COALESCE(v_current_qty, 0), p_quantity),
      'available', COALESCE(v_current_qty, 0)
    );
  END IF;

  v_new_qty := v_current_qty - p_quantity;

  UPDATE public.services
  SET stock_quantity = v_new_qty
  WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'success', true,
    'previous_qty', v_current_qty,
    'new_qty', v_new_qty
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.deduct_stock(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_stock(uuid, integer) TO service_role;

-- Public widget traffic goes through widget-chat, which uses the server-side
-- service-role database client. Do not expose the write RPC directly to browsers.
-- Catalog price/tenant/quantity validation is implemented in the separate
-- widget-order pricing migration; this grant boundary prevents RPC bypass.
REVOKE ALL ON FUNCTION public.create_widget_order(uuid, text, jsonb, text, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_widget_order(uuid, text, jsonb, text, text, text, jsonb, text) TO service_role;
ALTER FUNCTION public.create_widget_order(uuid, text, jsonb, text, text, text, jsonb, text) SET search_path = pg_catalog, public, pg_temp;

-- The current booking flows perform availability/conflict checks in the
-- server-side book-appointment/widget-chat paths. This legacy SECURITY DEFINER
-- RPC inserts directly and can bypass those checks if called by a client.
REVOKE ALL ON FUNCTION public.create_widget_appointment(uuid, text, text, timestamptz, timestamptz, text, text, uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_widget_appointment(uuid, text, text, timestamptz, timestamptz, text, text, uuid, text, text, text, jsonb) TO service_role;
-- gen_random_bytes lives in Supabase's locked-down extensions schema; include it
-- explicitly or booking will fail after hardening the SECURITY DEFINER path.
ALTER FUNCTION public.create_widget_appointment(uuid, text, text, timestamptz, timestamptz, text, text, uuid, text, text, text, jsonb) SET search_path = pg_catalog, extensions, public, pg_temp;

-- Revert must be owner-scoped because SECURITY DEFINER bypasses table RLS.
-- Preserve the live business-model recomputation and complete config mapping.
CREATE OR REPLACE FUNCTION public.revert_config_version(
  p_receptionist_id uuid,
  p_target_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_target record;
  v_business jsonb;
  v_capabilities jsonb;
  v_contact jsonb;
  v_model text;
  v_booking boolean;
  v_ordering boolean;
  v_new_version integer;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.receptionists r
    WHERE r.id = p_receptionist_id
      AND r.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_your_operator'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target
  FROM public.config_versions
  WHERE receptionist_id = p_receptionist_id
    AND version_number = p_target_version;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Version ' || p_target_version || ' not found');
  END IF;

  v_business := COALESCE(v_target.config_json -> 'business', '{}'::jsonb);
  v_capabilities := COALESCE(v_target.config_json -> 'capabilities', '{}'::jsonb);
  v_contact := v_target.config_json -> 'contact';

  -- Keep the live business_model derivation: bare true, {enabled}, and {steps}
  -- workflow shapes have established behavior and must not regress on rollback.
  v_booking := COALESCE((v_capabilities ->> 'books_appointments')::boolean, false)
    OR (v_target.config_json -> 'workflows' ? 'appointment_booking'
        AND COALESCE((((v_target.config_json -> 'workflows') -> 'appointment_booking') ->> 'enabled')::boolean, true));
  v_ordering := COALESCE((v_capabilities ->> 'sells_products')::boolean, false)
    OR COALESCE((v_capabilities ->> 'delivers')::boolean, false)
    OR (v_target.config_json -> 'workflows' ? 'product_ordering'
        AND COALESCE((((v_target.config_json -> 'workflows') -> 'product_ordering') ->> 'enabled')::boolean, true));
  v_model := CASE
    WHEN v_booking AND v_ordering THEN 'both'
    WHEN v_ordering THEN 'products'
    WHEN v_booking THEN 'services'
    ELSE 'internal'
  END;

  UPDATE public.receptionists
  SET name = COALESCE(v_business ->> 'display_name', name),
      business_name = COALESCE(v_business ->> 'display_name', business_name),
      business_type = COALESCE(v_business ->> 'business_type', business_type),
      greeting_message = COALESCE(v_business ->> 'greeting_message', greeting_message),
      tone = COALESCE((v_business ->> 'tone')::public.receptionist_tone, tone),
      language = COALESCE(v_business ->> 'language', language),
      currency = COALESCE(v_business ->> 'currency', currency),
      business_phone = COALESCE(v_contact ->> 'phone', business_phone),
      address = COALESCE(v_contact ->> 'address', address),
      website = COALESCE(v_contact ->> 'website', website),
      business_info = CASE
        WHEN v_contact IS NOT NULL THEN COALESCE(business_info, '{}'::jsonb) || jsonb_build_object('contact', v_contact)
        ELSE business_info
      END,
      capabilities = CASE
        WHEN v_capabilities <> '{}'::jsonb THEN v_capabilities
        ELSE capabilities
      END,
      knowledge_base = COALESCE(NULLIF(v_target.config_json ->> 'knowledge_base', ''), knowledge_base),
      business_model = v_model
  WHERE id = p_receptionist_id;

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_new_version
  FROM public.config_versions
  WHERE receptionist_id = p_receptionist_id;

  INSERT INTO public.config_versions (
    receptionist_id, version_number, config_json, plan_text,
    change_source, owner_input, approved_by, approved_at
  ) VALUES (
    p_receptionist_id, v_new_version, v_target.config_json, v_target.plan_text,
    'owner_revert', 'Reverted to version ' || p_target_version,
    p_receptionist_id, now()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'reverted_to', p_target_version,
    'new_version', v_new_version
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.revert_config_version(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revert_config_version(uuid, integer) TO authenticated;

-- Membership helpers are used by RLS policies. They must never answer
-- membership questions for arbitrary user IDs supplied by an anonymous or
-- different authenticated caller.
CREATE OR REPLACE FUNCTION public.get_user_org_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = _user_id
    AND _user_id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.has_org_role(_user_id uuid, _org_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT COALESCE(
    _user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.organization_members
      WHERE user_id = _user_id
        AND organization_id = _org_id
        AND role = _role
    ),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT COALESCE(
    _user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.organization_members
      WHERE user_id = _user_id
        AND organization_id = _org_id
    ),
    false
  );
$function$;

REVOKE ALL ON FUNCTION public.get_user_org_ids(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_org_role(uuid, uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_org_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_org_ids(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, public.app_role) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO anon, authenticated, service_role;

-- This helper already checks auth.uid() against the receptionist owner. Keep
-- it callable only by signed-in users rather than exposing it as a public RPC.
ALTER FUNCTION public.record_manual_version(uuid, text) SET search_path = pg_catalog, public, pg_temp;

-- Trigger-only SECURITY DEFINER functions use fully-qualified application tables,
-- but still need an explicit search_path. Their existing triggers continue to
-- fire without granting clients direct EXECUTE access to these trigger routines.
ALTER FUNCTION public.handle_new_user() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.touch_build_thread() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.touch_director_thread() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.update_business_modules_updated_at() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.handle_new_organization() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.sync_receptionist_phones() SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_build_thread() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_director_thread() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_business_modules_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_organization() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_receptionist_phones() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.record_manual_version(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_manual_version(uuid, text) TO authenticated;
