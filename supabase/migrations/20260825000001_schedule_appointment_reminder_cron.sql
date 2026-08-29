-- Migration: schedule_appointment_reminder_cron
-- Created: 2026-08-25 (OX-Alpha Phase 0.2 permanent fix)
--
-- WHY: setup-reminder-cron previously called supabase.rpc('cron.unschedule')
-- which PostgREST resolves as public.cron.unschedule — a function that does
-- not exist. The reminder cron therefore could NEVER register itself, leaving
-- the reminder pipeline dormant since launch. This SECURITY DEFINER RPC is the
-- only service_role-reachable entry point into schema-qualified cron.*.

CREATE OR REPLACE FUNCTION public.schedule_appointment_reminder_cron(
  p_supabase_url text,
  p_anon_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'appointment-reminders-24h') THEN
    PERFORM cron.unschedule('appointment-reminders-24h');
  END IF;

  PERFORM cron.schedule(
    'appointment-reminders-24h',
    '0 * * * *',
    format(
      'SELECT net.http_post(url:=%L, headers:=%L::jsonb, body:=%L::jsonb) as request_id;',
      p_supabase_url || '/functions/v1/appointment-reminder-runner',
      json_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || p_anon_key
      )::text,
      json_build_object('minutesAhead', 1440)::text
    )
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.schedule_appointment_reminder_cron(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.schedule_appointment_reminder_cron(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.schedule_appointment_reminder_cron(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_appointment_reminder_cron(text, text) TO service_role;
