-- Atomic create/edit/archive authorization and lifecycle audit regression.
-- Run after worker verification/publication migration and lifecycle audit migration.

DO $acl$
BEGIN
  IF has_function_privilege('anon', 'public.create_ai_worker_draft(uuid,uuid,text,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.create_ai_worker_draft(uuid,uuid,text,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.update_ai_worker_draft(uuid,uuid,integer,text,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.update_ai_worker_draft(uuid,uuid,integer,text,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.archive_ai_worker(uuid,uuid,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.archive_ai_worker(uuid,uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'worker lifecycle mutation RPCs must be service-role only';
  END IF;
  IF has_table_privilege('authenticated', 'public.ai_worker_lifecycle_events', 'INSERT')
     OR has_table_privilege('authenticated', 'public.ai_worker_lifecycle_events', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.ai_worker_lifecycle_events', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated clients must not forge or rewrite lifecycle audit events';
  END IF;
  IF has_table_privilege('service_role', 'public.ai_worker_lifecycle_events', 'UPDATE')
     OR has_table_privilege('service_role', 'public.ai_worker_lifecycle_events', 'DELETE')
     OR has_table_privilege('service_role', 'public.ai_worker_lifecycle_events', 'TRUNCATE') THEN
    RAISE EXCEPTION 'lifecycle audit events must be append-only for service_role';
  END IF;
END $acl$;

INSERT INTO auth.users(id) VALUES
 ('51000000-0000-0000-0000-000000000001'),
 ('51000000-0000-0000-0000-000000000002'),
 ('51000000-0000-0000-0000-000000000003'),
 ('51000000-0000-0000-0000-000000000004');

INSERT INTO public.organizations(id) VALUES ('52000000-0000-0000-0000-000000000001');
INSERT INTO public.organization_members(organization_id, user_id, role, joined_at) VALUES
 ('52000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', 'member', now()),
 ('52000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000003', 'admin', now());

DO $lifecycle$
DECLARE
  v_definition jsonb := '{"schema_version":1,"purpose":"test","inputs":[],"outputs":[],"capability_keys":[],"allowed_actions":["draft"],"autonomy_mode":"supervised"}'::jsonb;
  v_result jsonb;
  v_worker_id uuid;
  v_event_count integer;
BEGIN
  -- Personal creation is scoped to the actor supplied by the authenticated edge layer.
  v_result := public.create_ai_worker_draft(
    '51000000-0000-0000-0000-000000000001', NULL,
    'Personal test worker', '', v_definition
  );
  IF v_result->>'ok' <> 'true' THEN
    RAISE EXCEPTION 'personal draft creation should succeed: %', v_result;
  END IF;
  v_worker_id := (v_result->'worker'->>'id')::uuid;

  -- A joined organization member may create a team worker.
  v_result := public.create_ai_worker_draft(
    '51000000-0000-0000-0000-000000000002', '52000000-0000-0000-0000-000000000001',
    'Team test worker', '', v_definition
  );
  IF v_result->>'ok' <> 'true' THEN
    RAISE EXCEPTION 'joined organization member should create a team draft: %', v_result;
  END IF;

  -- A user who is not a joined member cannot create in that organization.
  v_result := public.create_ai_worker_draft(
    '51000000-0000-0000-0000-000000000004', '52000000-0000-0000-0000-000000000001',
    'Unauthorized team worker', '', v_definition
  );
  IF v_result->>'error' <> 'organization_access_denied' THEN
    RAISE EXCEPTION 'unjoined user must not create an organization worker: %', v_result;
  END IF;

  -- Version update and audit append are one transaction.
  v_result := public.update_ai_worker_draft(
    '51000000-0000-0000-0000-000000000001', v_worker_id, 1,
    'Updated personal worker', 'updated', v_definition || '{"purpose":"updated"}'::jsonb
  );
  IF v_result->>'ok' <> 'true' OR v_result->'worker'->>'version' <> '2' THEN
    RAISE EXCEPTION 'draft update should increment version: %', v_result;
  END IF;

  v_result := public.update_ai_worker_draft(
    '51000000-0000-0000-0000-000000000001', v_worker_id, 1,
    'Stale update', '', v_definition
  );
  IF v_result->>'error' <> 'worker_changed_concurrently' THEN
    RAISE EXCEPTION 'stale version update must fail closed: %', v_result;
  END IF;

  v_result := public.update_ai_worker_draft(
    '51000000-0000-0000-0000-000000000004', v_worker_id, 2,
    'Unauthorized update', '', v_definition
  );
  IF v_result->>'error' <> 'worker_access_denied' THEN
    RAISE EXCEPTION 'non-owner must not edit a personal worker: %', v_result;
  END IF;

  -- Active work prevents archival; the check and status change are atomic.
  INSERT INTO public.ai_worker_tasks(worker_id, created_by, title, goal, status)
  VALUES (v_worker_id, '51000000-0000-0000-0000-000000000001',
    'In-flight task', 'Do not strand this task', 'running');
  v_result := public.archive_ai_worker('51000000-0000-0000-0000-000000000001', v_worker_id, 2);
  IF v_result->>'error' <> 'active_tasks_must_be_resolved' THEN
    RAISE EXCEPTION 'worker with running tasks must not be archived: %', v_result;
  END IF;
  DELETE FROM public.ai_worker_tasks WHERE worker_id = v_worker_id;

  -- Organization member cannot archive a team worker; admin can.
  v_worker_id := (SELECT id FROM public.ai_workers WHERE name = 'Team test worker');
  v_result := public.archive_ai_worker('51000000-0000-0000-0000-000000000002', v_worker_id, 1);
  IF v_result->>'error' <> 'worker_archive_denied' THEN
    RAISE EXCEPTION 'ordinary team member must not archive organization worker: %', v_result;
  END IF;
  v_result := public.archive_ai_worker('51000000-0000-0000-0000-000000000003', v_worker_id, 1);
  IF v_result->>'ok' <> 'true' OR v_result->'worker'->>'status' <> 'archived' THEN
    RAISE EXCEPTION 'organization admin should archive worker: %', v_result;
  END IF;

  SELECT count(*) INTO v_event_count FROM public.ai_worker_lifecycle_events
  WHERE worker_id = v_worker_id;
  IF v_event_count <> 2 THEN
    RAISE EXCEPTION 'team create and archive should each produce exactly one event, found %', v_event_count;
  END IF;

  SELECT count(*) INTO v_event_count FROM public.ai_worker_lifecycle_events
  WHERE worker_id = (SELECT id FROM public.ai_workers WHERE created_by = '51000000-0000-0000-0000-000000000001' AND name = 'Updated personal worker');
  IF v_event_count <> 2 THEN
    RAISE EXCEPTION 'personal create and update should each produce exactly one event, found %', v_event_count;
  END IF;
END $lifecycle$;
