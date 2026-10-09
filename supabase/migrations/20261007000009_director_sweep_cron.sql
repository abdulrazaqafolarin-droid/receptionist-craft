-- Director sweep schedule: every 15 minutes, wake director-sweep.
--
-- Mirrors the plan-worker-sweep pattern (pg_cron + pg_net, anon key —
-- the sweep acts only within granted scopes and records everything in
-- the ledger, so a bare invocation cannot do anything ungranted).
-- Call schedule_director_sweep_cron(url, anon_key) once with the live
-- project values to arm it; the function is idempotent.

CREATE OR REPLACE FUNCTION public.schedule_director_sweep_cron(p_supabase_url text, p_anon_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'director-sweep') THEN
    PERFORM cron.unschedule('director-sweep');
  END IF;

  PERFORM cron.schedule(
    'director-sweep',
    '*/15 * * * *',
    format(
      'SELECT net.http_post(url:=%L, headers:=%L::jsonb, body:=%L::jsonb) as request_id;',
      p_supabase_url || '/functions/v1/director-sweep',
      json_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || p_anon_key
      )::text,
      json_build_object('sweep', true)::text
    )
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.schedule_director_sweep_cron(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.schedule_director_sweep_cron(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.schedule_director_sweep_cron(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_director_sweep_cron(text, text) TO service_role;
