-- Regression tests for persistent atomic worker rate limiting.
-- Run after the worker foundation bootstrap and persistent rate-limit migration.

DO $acl$
BEGIN
  IF has_function_privilege('anon', 'public.consume_ai_worker_rate_limit(uuid,text,integer,integer,integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.consume_ai_worker_rate_limit(uuid,text,integer,integer,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'only trusted server code may consume worker rate-limit buckets';
  END IF;
  IF has_table_privilege('anon', 'public.ai_worker_rate_limit_buckets', 'SELECT')
     OR has_table_privilege('authenticated', 'public.ai_worker_rate_limit_buckets', 'SELECT')
     OR has_table_privilege('service_role', 'public.ai_worker_rate_limit_buckets', 'SELECT')
     OR has_table_privilege('service_role', 'public.ai_worker_rate_limit_buckets', 'INSERT')
     OR has_table_privilege('service_role', 'public.ai_worker_rate_limit_buckets', 'UPDATE') THEN
    RAISE EXCEPTION 'rate-limit buckets must not be directly readable or mutable';
  END IF;
END $acl$;

INSERT INTO auth.users(id) VALUES
 ('54000000-0000-0000-0000-000000000001'),
 ('54000000-0000-0000-0000-000000000002');

DO $limits$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.consume_ai_worker_rate_limit(
    '54000000-0000-0000-0000-000000000001', 'worker-registry',
    60, 2, 5, 10
  );
  IF v_result->>'allowed' <> 'true' THEN
    RAISE EXCEPTION 'first request should be allowed: %', v_result;
  END IF;

  v_result := public.consume_ai_worker_rate_limit(
    '54000000-0000-0000-0000-000000000001', 'worker-registry',
    60, 2, 5, 10
  );
  IF v_result->>'allowed' <> 'true' THEN
    RAISE EXCEPTION 'second request should be allowed at the limit: %', v_result;
  END IF;

  v_result := public.consume_ai_worker_rate_limit(
    '54000000-0000-0000-0000-000000000001', 'worker-registry',
    60, 2, 5, 10
  );
  IF v_result->>'allowed' <> 'false' OR v_result->>'reason' <> 'window'
     OR (v_result->>'retry_after_seconds')::integer < 1 THEN
    RAISE EXCEPTION 'third request should be rejected by persistent window limit: %', v_result;
  END IF;

  -- Scope and user IDs isolate counters.
  v_result := public.consume_ai_worker_rate_limit(
    '54000000-0000-0000-0000-000000000001', 'worker-runner',
    60, 2, 5, 10
  );
  IF v_result->>'allowed' <> 'true' THEN
    RAISE EXCEPTION 'separate endpoint scope must have its own bucket: %', v_result;
  END IF;

  v_result := public.consume_ai_worker_rate_limit(
    '54000000-0000-0000-0000-000000000002', 'worker-registry',
    60, 2, 5, 10
  );
  IF v_result->>'allowed' <> 'true' THEN
    RAISE EXCEPTION 'separate actor must have its own bucket: %', v_result;
  END IF;

  v_result := public.consume_ai_worker_rate_limit(
    '54000000-0000-0000-0000-000000000001', 'worker-burst',
    60, 100, 5, 2
  );
  IF v_result->>'allowed' <> 'true' THEN RAISE EXCEPTION 'burst request 1 should pass'; END IF;
  v_result := public.consume_ai_worker_rate_limit(
    '54000000-0000-0000-0000-000000000001', 'worker-burst',
    60, 100, 5, 2
  );
  IF v_result->>'allowed' <> 'true' THEN RAISE EXCEPTION 'burst request 2 should pass'; END IF;
  v_result := public.consume_ai_worker_rate_limit(
    '54000000-0000-0000-0000-000000000001', 'worker-burst',
    60, 100, 5, 2
  );
  IF v_result->>'allowed' <> 'false' OR v_result->>'reason' <> 'burst' THEN
    RAISE EXCEPTION 'third rapid request should be rejected by burst limit: %', v_result;
  END IF;

  v_result := public.consume_ai_worker_rate_limit(
    NULL, 'worker-registry', 60, 30, 5, 6
  );
  IF v_result->>'error' <> 'invalid_rate_limit_request' THEN
    RAISE EXCEPTION 'invalid caller identity must be rejected: %', v_result;
  END IF;
END $limits$;
