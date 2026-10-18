-- Database-enforced concurrency ceilings for the supervised worker runner.
-- Advisory transaction locks serialize only the short claim transaction, so
-- claims cannot race past the global or scoped limits. Draft generation itself
-- continues concurrently after the claim transaction commits.
--
-- Conservative initial limits: 50 globally, 3 per task creator, 10 per org,
-- and 2 per worker. Capability-level limits are deferred until real capability
-- adapters exist; the current runner only generates drafts.

-- Runner-triggered lease recovery must be scoped to the already-authorized worker.
-- Do not let a request for one tenant's worker block expired tasks belonging to
-- other tenants. The global maintenance RPC remains server-side only.
CREATE OR REPLACE FUNCTION public.block_expired_ai_worker_tasks_for_worker(
  p_worker_id uuid,
  p_limit integer DEFAULT 50
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_task public.ai_worker_tasks%ROWTYPE;
  v_count integer := 0;
BEGIN
  IF p_worker_id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid_worker_recovery_request' USING ERRCODE = '22023';
  END IF;

  FOR v_task IN
    SELECT * FROM public.ai_worker_tasks
    WHERE worker_id = p_worker_id
      AND status = 'running'
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at <= clock_timestamp()
    ORDER BY lease_expires_at ASC, id ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.ai_worker_tasks
    SET status = 'blocked',
        error_text = 'lease_expired_unknown_outcome: reconcile before retry',
        lease_token = NULL,
        lease_expires_at = NULL,
        heartbeat_at = clock_timestamp(),
        updated_at = clock_timestamp()
    WHERE id = v_task.id;

    INSERT INTO public.ai_worker_task_events(task_id, event_type, from_status, to_status, details)
    VALUES (v_task.id, 'status_changed', 'running', 'blocked',
      jsonb_build_object(
        'reason', 'lease_expired_unknown_outcome',
        'execution_attempt_id', v_task.execution_attempt_id,
        'recovery_scope', 'worker'
      ));
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.block_expired_ai_worker_tasks_for_worker(uuid, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.block_expired_ai_worker_tasks_for_worker(uuid, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_ai_worker_task_concurrency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_organization_id uuid;
  v_running integer;
BEGIN
  SELECT w.organization_id INTO v_organization_id
  FROM public.ai_workers w
  WHERE w.id = NEW.worker_id;

  -- Acquire locks in one fixed order. The global lock makes the global ceiling
  -- race-safe; scoped locks keep the intent explicit if global limits are later
  -- sharded by runtime or capability.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai-worker-global-concurrency', 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai-worker-user:' || NEW.created_by::text, 0)
  );
  IF v_organization_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('ai-worker-org:' || v_organization_id::text, 0)
    );
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai-worker-worker:' || NEW.worker_id::text, 0)
  );

  SELECT count(*) INTO v_running
  FROM public.ai_worker_tasks t
  WHERE t.status = 'running'
    AND (t.lease_expires_at IS NULL OR t.lease_expires_at > clock_timestamp())
    AND t.id IS DISTINCT FROM NEW.id;
  IF v_running >= 50 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'worker_concurrency_limit_global';
  END IF;

  SELECT count(*) INTO v_running
  FROM public.ai_worker_tasks t
  WHERE t.status = 'running'
    AND (t.lease_expires_at IS NULL OR t.lease_expires_at > clock_timestamp())
    AND t.created_by = NEW.created_by
    AND t.id IS DISTINCT FROM NEW.id;
  IF v_running >= 3 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'worker_concurrency_limit_user';
  END IF;

  IF v_organization_id IS NOT NULL THEN
    SELECT count(*) INTO v_running
    FROM public.ai_worker_tasks t
    JOIN public.ai_workers w ON w.id = t.worker_id
    WHERE t.status = 'running'
      AND (t.lease_expires_at IS NULL OR t.lease_expires_at > clock_timestamp())
      AND w.organization_id = v_organization_id
      AND t.id IS DISTINCT FROM NEW.id;
    IF v_running >= 10 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'worker_concurrency_limit_organization';
    END IF;
  END IF;

  SELECT count(*) INTO v_running
  FROM public.ai_worker_tasks t
  WHERE t.status = 'running'
    AND (t.lease_expires_at IS NULL OR t.lease_expires_at > clock_timestamp())
    AND t.worker_id = NEW.worker_id
    AND t.id IS DISTINCT FROM NEW.id;
  IF v_running >= 2 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'worker_concurrency_limit_worker';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_ai_worker_task_concurrency() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS ai_worker_task_concurrency_guard ON public.ai_worker_tasks;
CREATE TRIGGER ai_worker_task_concurrency_guard
BEFORE UPDATE OF status ON public.ai_worker_tasks
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'running')
EXECUTE FUNCTION public.enforce_ai_worker_task_concurrency();

COMMENT ON FUNCTION public.enforce_ai_worker_task_concurrency() IS
  'Enforces race-safe global, per-user, per-organization, and per-worker concurrency ceilings when a queued task is claimed; only the trusted claim RPC can transition tasks to running.';
