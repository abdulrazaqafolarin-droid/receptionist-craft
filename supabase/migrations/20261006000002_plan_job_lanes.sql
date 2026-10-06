-- Plan job lanes (systematic worker coexistence).
--
-- Lanes describe CONSTRAINT PROFILES, not machines — deliberately, so a
-- hosting move (local box -> VPS) changes where workers run, never what
-- lanes mean:
--   'fast' : wall-clock constrained worker (edge 150s wall). Takes new
--            jobs, wins the quick ones, hands the rest off. Never retries
--            its own failures.
--   'long' : unconstrained worker (no idle wall). Takes ONLY escalated
--            jobs and grinds them to done/failed, however long they take.
--   'any'  : unclaimed. Either lane's claim stamps it (fast first).
--
-- Escalation ladder, one-directional: fast -> long. Exactly one worker
-- ever owns a job (atomic claim). No races, no duplication, observable
-- at every step via lane + trace.

ALTER TABLE public.plan_jobs
  ADD COLUMN IF NOT EXISTS lane TEXT NOT NULL DEFAULT 'any'
  CHECK (lane IN ('any', 'fast', 'long'));

CREATE INDEX IF NOT EXISTS idx_plan_jobs_lane_queue
  ON public.plan_jobs (status, lane, created_at)
  WHERE status = 'queued';

-- Atomic claim honoring lanes. The fast worker passes 'fast' (takes
-- 'any' jobs and stamps them); the long worker passes 'long' (takes
-- only escalated jobs). Concurrent ticks serialize on the row lock.
-- Replaces the zero-arg claim (dropped below) — same name, lane-aware.
DROP FUNCTION IF EXISTS public.claim_plan_job();

CREATE OR REPLACE FUNCTION public.claim_plan_job(p_lane text DEFAULT 'fast')
RETURNS TABLE (
  id uuid,
  receptionist_id uuid,
  user_id uuid,
  kind text,
  input_json jsonb,
  attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  picked_id uuid;
BEGIN
  IF p_lane NOT IN ('fast', 'long') THEN
    RAISE EXCEPTION 'unknown lane %', p_lane;
  END IF;

  SELECT j.id INTO picked_id
  FROM public.plan_jobs j
  WHERE j.status = 'queued'
    AND j.attempts < 3
    AND (
      (p_lane = 'fast' AND j.lane IN ('any', 'fast'))
      OR
      (p_lane = 'long' AND j.lane = 'long')
    )
  ORDER BY j.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF picked_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.plan_jobs AS pu
  SET status = 'running',
      started_at = now(),
      attempts = pu.attempts + 1,
      lane = CASE WHEN pu.lane = 'any' THEN p_lane ELSE pu.lane END
  WHERE pu.id = picked_id
  RETURNING pu.id, pu.receptionist_id, pu.user_id,
            pu.kind, pu.input_json, pu.attempts;
END;
$fn$;

REVOKE ALL ON FUNCTION public.claim_plan_job(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_plan_job(text) FROM anon;
REVOKE ALL ON FUNCTION public.claim_plan_job(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_plan_job(text) TO service_role;
