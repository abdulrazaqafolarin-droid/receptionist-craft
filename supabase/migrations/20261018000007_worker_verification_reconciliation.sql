-- Lazy, bounded recovery for verification runs abandoned by an Edge Function crash.
-- Runs are reconciled on the next authorized worker read/verification request. The
-- worker ID scope prevents a tenant from triggering cleanup for another tenant.

CREATE OR REPLACE FUNCTION public.reconcile_stale_ai_worker_verification_runs(
  p_worker_id uuid,
  p_stale_seconds integer DEFAULT 300,
  p_limit integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_run public.ai_worker_verification_runs%ROWTYPE;
  v_reconciled integer := 0;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_worker_id IS NULL
     OR p_stale_seconds IS NULL OR p_stale_seconds NOT BETWEEN 300 AND 86400
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_reconciliation_request');
  END IF;

  FOR v_run IN
    SELECT r.*
    FROM public.ai_worker_verification_runs r
    WHERE r.worker_id = p_worker_id
      AND r.status = 'running'
      AND r.created_at <= v_now - make_interval(secs => p_stale_seconds)
    ORDER BY r.created_at ASC, r.id ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.ai_worker_verification_runs
    SET status = 'failed',
        tests = jsonb_build_array(jsonb_build_object(
          'name', 'runtime_reconciliation',
          'passed', false,
          'detail', 'Verification exceeded its allowed runtime and was reconciled as failed.'
        )),
        summary = 'Verification timed out or its Edge Function terminated unexpectedly. Run verification again.',
        completed_at = v_now
    WHERE id = v_run.id
      AND status = 'running';

    IF FOUND THEN
      INSERT INTO public.ai_worker_lifecycle_events (
        worker_id, actor_id, event_type, from_status, to_status, details
      ) VALUES (
        v_run.worker_id, NULL, 'worker_verification_failed', 'draft', 'draft',
        jsonb_build_object(
          'version', v_run.worker_version,
          'verification_run_id', v_run.id,
          'definition_hash', v_run.definition_hash,
          'reason', 'stale_run_reconciled'
        )
      );
      v_reconciled := v_reconciled + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'reconciled', v_reconciled);
END;
$function$;

REVOKE ALL ON FUNCTION public.reconcile_stale_ai_worker_verification_runs(uuid, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_stale_ai_worker_verification_runs(uuid, integer, integer)
  TO service_role;

COMMENT ON FUNCTION public.reconcile_stale_ai_worker_verification_runs(uuid, integer, integer) IS
  'Marks only stale running verification records for one worker as failed and appends an audit event atomically; called on authorized reads/verification attempts.';
