-- Async planning jobs (fallback C) — planning calls routinely exceed the
-- 150s edge idle limit (120s gateway turns + research tail), so long work
-- moves to background jobs nobody waits on. The frontend polls its own rows.
--
-- Flow: propose/request-change with {async:true} inserts a queued row and
-- returns {job_id} in <1s. pg_cron sweeps queued rows into plan-worker
-- every minute. The worker runs the full pipeline with long timeouts and
-- marks the row done (result) or failed (error + trace). Owners read only
-- their own rows; the worker uses the service role.

CREATE TABLE IF NOT EXISTS public.plan_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('operator', 'change')),
  input_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  result_json     JSONB,
  error_text      TEXT,
  trace_json      JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_plan_jobs_queue
  ON public.plan_jobs (status, created_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_plan_jobs_receptionist
  ON public.plan_jobs (receptionist_id, created_at DESC);

ALTER TABLE public.plan_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can view own plan jobs" ON public.plan_jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Owner can create own plan jobs" ON public.plan_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage plan jobs" ON public.plan_jobs
  FOR ALL USING (true);

-- Sweep: every minute, wake the worker (it claims one queued job itself;
-- overlapping ticks are harmless thanks to SKIP LOCKED).
CREATE OR REPLACE FUNCTION public.schedule_plan_worker_cron(p_supabase_url text, p_anon_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'plan-worker-sweep') THEN
    PERFORM cron.unschedule('plan-worker-sweep');
  END IF;

  PERFORM cron.schedule(
    'plan-worker-sweep',
    '* * * * *',
    format(
      'SELECT net.http_post(url:=%L, headers:=%L::jsonb, body:=%L::jsonb) as request_id;',
      p_supabase_url || '/functions/v1/plan-worker',
      json_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || p_anon_key
      )::text,
      json_build_object('sweep', true)::text
    )
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.schedule_plan_worker_cron(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.schedule_plan_worker_cron(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.schedule_plan_worker_cron(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_plan_worker_cron(text, text) TO service_role;

-- Atomic single-job claim. Concurrent sweeps block on the row lock, then
-- re-evaluate status='queued' against the winner's commit and match zero
-- rows — exactly one worker ever wins a job. Attempts cap at 3.
CREATE OR REPLACE FUNCTION public.claim_plan_job()
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
  SELECT j.id INTO picked_id
  FROM public.plan_jobs j
  WHERE j.status = 'queued' AND j.attempts < 3
  ORDER BY j.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF picked_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.plan_jobs
  SET status = 'running',
      started_at = now(),
      attempts = attempts + 1
  WHERE plan_jobs.id = picked_id
  RETURNING plan_jobs.id, plan_jobs.receptionist_id, plan_jobs.user_id,
            plan_jobs.kind, plan_jobs.input_json, plan_jobs.attempts;
END;
$fn$;

REVOKE ALL ON FUNCTION public.claim_plan_job() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_plan_job() FROM anon;
REVOKE ALL ON FUNCTION public.claim_plan_job() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_plan_job() TO service_role;
