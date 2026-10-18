-- The only publishable action is draft until matching capability adapters exist.
-- Run after worker verification, lifecycle audit, and persistent rate-limit migrations.

DO $acl$
BEGIN
  IF has_function_privilege('anon', 'public.publish_ai_worker(uuid,uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.publish_ai_worker(uuid,uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'publication gate must be service-role only';
  END IF;
END $acl$;

INSERT INTO auth.users(id) VALUES ('56000000-0000-0000-0000-000000000001');

DO $publication$
DECLARE
  v_draft jsonb := '{
    "schema_version":1,
    "purpose":"Generate drafts only",
    "responsibilities":["Draft text"],
    "inputs":[{"key":"request","label":"Request","type":"text","required":true}],
    "outputs":[{"key":"result","label":"Draft","type":"text","required":true}],
    "capability_keys":[],
    "allowed_actions":["draft"],
    "approval_required_for":["external_write","send_message","publish","purchase","payment","delete","permission_change","data_export"],
    "autonomy_mode":"supervised",
    "execution":{"max_steps":5,"timeout_seconds":90,"max_retries":0},
    "verification":{"success_criteria":["Return a useful draft"],"require_evidence":true},
    "workspace":{"layout":"task_board","panels":["tasks","outputs"]}
  }'::jsonb;
  v_research jsonb;
  v_internal_read jsonb;
  v_null_action jsonb;
  v_missing_actions jsonb;
  v_result jsonb;
BEGIN
  v_research := jsonb_set(v_draft, '{allowed_actions}', '["draft","research"]'::jsonb);
  v_internal_read := jsonb_set(v_draft, '{allowed_actions}', '["draft","internal_read"]'::jsonb);
  v_null_action := jsonb_set(v_draft, '{allowed_actions}', '["draft",null]'::jsonb);
  v_missing_actions := v_draft - 'allowed_actions';

  INSERT INTO public.ai_workers(id, organization_id, created_by, name, status, version, definition)
  VALUES
    ('23000000-0000-0000-0000-000000000010', NULL, '56000000-0000-0000-0000-000000000001', 'Draft-only allowed', 'draft', 1, v_draft),
    ('23000000-0000-0000-0000-000000000011', NULL, '56000000-0000-0000-0000-000000000001', 'Research must be blocked', 'draft', 1, v_research),
    ('23000000-0000-0000-0000-000000000012', NULL, '56000000-0000-0000-0000-000000000001', 'Internal read must be blocked', 'draft', 1, v_internal_read),
    ('23000000-0000-0000-0000-000000000013', NULL, '56000000-0000-0000-0000-000000000001', 'Null action must be blocked', 'draft', 1, v_null_action),
    ('23000000-0000-0000-0000-000000000014', NULL, '56000000-0000-0000-0000-000000000001', 'Missing actions must be blocked', 'draft', 1, v_missing_actions);

  INSERT INTO public.ai_worker_verification_runs(
    id, worker_id, actor_id, worker_version, definition_hash, definition_snapshot, status, tests, summary, completed_at
  ) VALUES
    ('43000000-0000-0000-0000-000000000010', '23000000-0000-0000-0000-000000000010', '56000000-0000-0000-0000-000000000001', 1, repeat('a',64), v_draft, 'passed', '[{"name":"fixture","passed":true}]'::jsonb, 'passed fixture', now()),
    ('43000000-0000-0000-0000-000000000011', '23000000-0000-0000-0000-000000000011', '56000000-0000-0000-0000-000000000001', 1, repeat('b',64), v_research, 'passed', '[{"name":"fixture","passed":true}]'::jsonb, 'forged pass fixture', now()),
    ('43000000-0000-0000-0000-000000000012', '23000000-0000-0000-0000-000000000012', '56000000-0000-0000-0000-000000000001', 1, repeat('c',64), v_internal_read, 'passed', '[{"name":"fixture","passed":true}]'::jsonb, 'forged pass fixture', now()),
    ('43000000-0000-0000-0000-000000000013', '23000000-0000-0000-0000-000000000013', '56000000-0000-0000-0000-000000000001', 1, repeat('d',64), v_null_action, 'passed', '[{"name":"fixture","passed":true}]'::jsonb, 'forged pass fixture', now()),
    ('43000000-0000-0000-0000-000000000014', '23000000-0000-0000-0000-000000000014', '56000000-0000-0000-0000-000000000001', 1, repeat('e',64), v_missing_actions, 'passed', '[{"name":"fixture","passed":true}]'::jsonb, 'forged pass fixture', now());

  v_result := public.publish_ai_worker(
    '23000000-0000-0000-0000-000000000011',
    '56000000-0000-0000-0000-000000000001',
    '43000000-0000-0000-0000-000000000011', 'draft'
  );
  IF v_result->>'error' <> 'worker_not_supported_by_draft_runner' THEN
    RAISE EXCEPTION 'research action must not publish without a research adapter: %', v_result;
  END IF;

  v_result := public.publish_ai_worker(
    '23000000-0000-0000-0000-000000000012',
    '56000000-0000-0000-0000-000000000001',
    '43000000-0000-0000-0000-000000000012', 'draft'
  );
  IF v_result->>'error' <> 'worker_not_supported_by_draft_runner' THEN
    RAISE EXCEPTION 'internal-read action must not publish without a verified adapter: %', v_result;
  END IF;

  v_result := public.publish_ai_worker(
    '23000000-0000-0000-0000-000000000013',
    '56000000-0000-0000-0000-000000000001',
    '43000000-0000-0000-0000-000000000013', 'draft'
  );
  IF v_result->>'error' <> 'worker_not_supported_by_draft_runner' THEN
    RAISE EXCEPTION 'null action values must fail closed: %', v_result;
  END IF;

  v_result := public.publish_ai_worker(
    '23000000-0000-0000-0000-000000000014',
    '56000000-0000-0000-0000-000000000001',
    '43000000-0000-0000-0000-000000000014', 'draft'
  );
  IF v_result->>'error' <> 'worker_not_supported_by_draft_runner' THEN
    RAISE EXCEPTION 'missing action arrays must fail closed: %', v_result;
  END IF;

  v_result := public.publish_ai_worker(
    '23000000-0000-0000-0000-000000000010',
    '56000000-0000-0000-0000-000000000001',
    '43000000-0000-0000-0000-000000000010', 'draft'
  );
  IF v_result->>'ok' <> 'true' OR v_result->'worker'->>'status' <> 'active' THEN
    RAISE EXCEPTION 'verified draft-only worker should still publish: %', v_result;
  END IF;
END $publication$;
