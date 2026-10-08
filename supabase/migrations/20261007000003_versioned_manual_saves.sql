-- Versioned manual saves: close the Builder side door.
--
-- Problem 1: Builder hand-edits write straight to the live row. No version
-- is recorded, so version history, revert, and the Playground trail all go
-- blind. record_manual_version() snapshots live state after each manual
-- save (called from the Builder, never silently).
--
-- Problem 2 (found while proving Problem 1): revert_config_version writes
-- to columns that DO NOT EXIST (contact_info, operating_hours, policies,
-- channels, industry), so reverting ANY AI-planned operator errors out.
-- It also never restored knowledge_base and never recomputed
-- business_model. Repaired below to map real columns only.
--
-- NOTE (flagged, deliberately not changed): revert has no ownership check.
-- Adding auth.uid() gating would break edge-function callers that run it
-- under service role (NULL uid). Any hardening must distinguish caller
-- type first — left for a dedicated security pass.

-- ---------------------------------------------------------------------------
-- Repaired revert: real columns only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revert_config_version(
  p_receptionist_id UUID,
  p_target_version INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_target RECORD;
  v_business JSONB;
  v_capabilities JSONB;
  v_contact JSONB;
  v_model TEXT;
  v_booking BOOLEAN;
  v_ordering BOOLEAN;
  v_new_version INT;
  v_result JSONB;
BEGIN
  SELECT * INTO v_target
  FROM config_versions
  WHERE receptionist_id = p_receptionist_id
    AND version_number = p_target_version;

  IF v_target IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Version ' || p_target_version || ' not found');
  END IF;

  v_business := COALESCE(v_target.config_json -> 'business', '{}'::jsonb);
  v_capabilities := COALESCE(v_target.config_json -> 'capabilities', '{}'::jsonb);
  v_contact := v_target.config_json -> 'contact';

  -- business_model recomputed from the reverted capabilities (same tolerant
  -- semantics as approve: {enabled}, {steps}, or bare true all count as on).
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

  -- NOTE: tone is a real Postgres enum (receptionist_tone), not text —
  -- COALESCE across the two types is a 42804 error, hence the cast.
  UPDATE receptionists
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
  FROM config_versions
  WHERE receptionist_id = p_receptionist_id;

  INSERT INTO config_versions (
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
$$;

-- ---------------------------------------------------------------------------
-- Manual snapshot recorder: called by the Builder after each successful
-- hand-edit. Shape matches what the repaired revert reads (business,
-- capabilities, knowledge_base, contact), so manual versions revert
-- exactly like planned ones.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_manual_version(
  p_receptionist_id UUID,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row RECORD;
  v_num INT;
  v_id UUID;
  v_cfg JSONB;
BEGIN
  SELECT * INTO v_row FROM public.receptionists r
  WHERE r.id = p_receptionist_id AND r.user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_your_operator';
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_num
  FROM public.config_versions WHERE receptionist_id = p_receptionist_id;

  v_cfg := jsonb_build_object(
    'business', jsonb_build_object(
      'display_name', COALESCE(v_row.business_name, v_row.name),
      'business_type', v_row.business_type,
      'greeting_message', v_row.greeting_message,
      'tone', v_row.tone,
      'language', v_row.language,
      'currency', v_row.currency
    ),
    'capabilities', COALESCE(v_row.capabilities, '{}'::jsonb),
    'knowledge_base', COALESCE(v_row.knowledge_base, ''),
    'contact', jsonb_build_object(
      'phone', v_row.business_phone,
      'address', v_row.address,
      'website', v_row.website
    ),
    'manual_snapshot', true
  );

  INSERT INTO public.config_versions (
    receptionist_id, version_number, config_json, plan_text,
    change_source, owner_input
  ) VALUES (
    p_receptionist_id, v_num, v_cfg,
    'Manual edit recorded from the Builder.',
    'manual_edit', p_note
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'version_id', v_id, 'version_number', v_num);
END;
$$;
