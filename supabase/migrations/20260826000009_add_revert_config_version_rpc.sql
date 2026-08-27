-- revert_config_version: Revert a receptionist's live config to a previous version
-- This is the REAL operational rollback — it writes config back to the receptionists table.
-- Creates a new config_version entry documenting the revert.

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
  v_update JSONB := '{}'::jsonb;
  v_business JSONB;
  v_capabilities JSONB;
  v_channels JSONB;
  v_customer_fields JSONB;
  v_new_version INT;
  v_result JSONB;
BEGIN
  -- Find the target version
  SELECT * INTO v_target
  FROM config_versions
  WHERE receptionist_id = p_receptionist_id
    AND version_number = p_target_version;

  IF v_target IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Version ' || p_target_version || ' not found'
    );
  END IF;

  v_business := COALESCE(v_target.config_json -> 'business', '{}'::jsonb);
  v_capabilities := COALESCE(v_target.config_json -> 'capabilities', '{}'::jsonb);
  v_channels := COALESCE(v_target.config_json -> 'channels', '{}'::jsonb);
  v_customer_fields := COALESCE(v_target.config_json -> 'customer_fields', '[]'::jsonb);

  -- Build update payload from config sections
  IF v_business ->> 'display_name' IS NOT NULL THEN
    v_update := v_update || jsonb_build_object(
      'name', v_business ->> 'display_name',
      'business_name', v_business ->> 'display_name'
    );
  END IF;
  IF v_business ->> 'business_type' IS NOT NULL THEN
    v_update := v_update || jsonb_build_object('business_type', v_business ->> 'business_type');
  END IF;
  IF v_business ->> 'greeting_message' IS NOT NULL THEN
    v_update := v_update || jsonb_build_object('greeting_message', v_business ->> 'greeting_message');
  END IF;
  IF v_business ->> 'tone' IS NOT NULL THEN
    v_update := v_update || jsonb_build_object('tone', v_business ->> 'tone');
  END IF;
  IF v_business ->> 'industry' IS NOT NULL THEN
    v_update := v_update || jsonb_build_object('industry', v_business ->> 'industry');
  END IF;
  IF v_business ->> 'language' IS NOT NULL THEN
    v_update := v_update || jsonb_build_object('language', v_business ->> 'language');
  END IF;
  IF v_business ->> 'currency' IS NOT NULL THEN
    v_update := v_update || jsonb_build_object('currency', v_business ->> 'currency');
  END IF;

  -- Contact, hours, policies, channels, capabilities, customer_fields
  IF v_target.config_json -> 'contact' IS NOT NULL THEN
    v_update := v_update || jsonb_build_object('contact_info', v_target.config_json -> 'contact');
  END IF;
  IF v_target.config_json -> 'hours' IS NOT NULL THEN
    v_update := v_update || jsonb_build_object('operating_hours', v_target.config_json -> 'hours');
  END IF;
  IF v_target.config_json -> 'policies' IS NOT NULL THEN
    v_update := v_update || jsonb_build_object('policies', v_target.config_json -> 'policies');
  END IF;
  IF jsonb_object_keys(v_channels) IS NOT NULL THEN
    v_update := v_update || jsonb_build_object('channels', v_channels);
  END IF;
  IF jsonb_object_keys(v_capabilities) IS NOT NULL THEN
    v_update := v_update || jsonb_build_object('capabilities', v_capabilities);
  END IF;
  IF jsonb_array_length(v_customer_fields) > 0 THEN
    v_update := v_update || jsonb_build_object('customer_fields', v_customer_fields);
  END IF;

  -- Apply to live receptionist
  IF jsonb_object_keys(v_update) IS NOT NULL THEN
    UPDATE receptionists
    SET name = COALESCE(v_update ->> 'name', name),
        business_name = COALESCE(v_update ->> 'business_name', business_name),
        business_type = COALESCE(v_update ->> 'business_type', business_type),
        greeting_message = COALESCE(v_update ->> 'greeting_message', greeting_message),
        tone = COALESCE(v_update ->> 'tone', tone),
        industry = COALESCE(v_update ->> 'industry', industry),
        language = COALESCE(v_update ->> 'language', language),
        currency = COALESCE(v_update ->> 'currency', currency),
        contact_info = COALESCE(v_update -> 'contact_info', contact_info),
        operating_hours = COALESCE(v_update -> 'operating_hours', operating_hours),
        policies = COALESCE(v_update -> 'policies', policies),
        channels = COALESCE(v_update -> 'channels', channels),
        capabilities = COALESCE(v_update -> 'capabilities', capabilities),
        customer_fields = COALESCE(v_update -> 'customer_fields', customer_fields)
    WHERE id = p_receptionist_id;
  END IF;

  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_new_version
  FROM config_versions
  WHERE receptionist_id = p_receptionist_id;

  -- Save revert as new version
  INSERT INTO config_versions (
    receptionist_id, version_number, config_json, plan_text,
    change_source, owner_input, approved_by, approved_at
  ) VALUES (
    p_receptionist_id, v_new_version, v_target.config_json, v_target.plan_text,
    'owner_revert', 'Reverted to version ' || p_target_version,
    p_receptionist_id, now()
  );

  v_result := jsonb_build_object(
    'ok', true,
    'reverted_to', p_target_version,
    'new_version', v_new_version,
    'config_applied', v_update
  );

  RETURN v_result;
END;
$$;
