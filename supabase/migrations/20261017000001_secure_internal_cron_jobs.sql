-- Secure privileged background Edge Function schedules.
--
-- Prerequisites before applying:
-- 1. Set Edge Function secret RUTEX_INTERNAL_CRON_SECRET to a random value
--    of at least 32 bytes.
-- 2. Store the exact same value in Supabase Vault as
--    "rutex_internal_cron_secret".
-- 3. Deploy the guarded worker code from this change.
--
-- This migration stores no secret in source control or cron.job.command.
-- Each scheduled HTTP request reads the secret from Vault at execution time.
-- Apply only after production migration history has been reconciled.

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.secrets WHERE name = 'rutex_internal_cron_secret'
  ) THEN
    RAISE EXCEPTION
      'Missing Vault secret rutex_internal_cron_secret. Create it before scheduling privileged workers.';
  END IF;

  -- Refuse to install jobs if the Vault entry exists but is empty.
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'rutex_internal_cron_secret'
      AND length(decrypted_secret) >= 32
  ) THEN
    RAISE EXCEPTION
      'Vault secret rutex_internal_cron_secret must contain at least 32 characters.';
  END IF;
END
$migration$;

-- Keep the existing setup-reminder-cron RPC compatible, but never let it
-- replace the guarded reminder job with an anon-key Authorization header.
-- p_anon_key remains in the signature for deployed callers and is intentionally
-- ignored. The secret value is read from Vault only when the cron command runs.
CREATE OR REPLACE FUNCTION public.schedule_appointment_reminder_cron(
  p_supabase_url text,
  p_anon_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, cron, pg_temp
AS $function$
BEGIN
  IF p_supabase_url IS NULL OR p_supabase_url !~ '^https://[^/]+
WHERE jobname IN ('plan-worker-sweep', 'appointment-reminders-24h', 'director-sweep');

SELECT cron.schedule(
  'plan-worker-sweep',
  '* * * * *',
  $job$
    SELECT net.http_post(
      url := 'https://esvrhnlwquunsdduvbnr.supabase.co/functions/v1/plan-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-rutex-cron-secret',
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'rutex_internal_cron_secret')
      ),
      body := '{"sweep":true}'::jsonb
    );
  $job$
);

SELECT cron.schedule(
  'appointment-reminders-24h',
  '0 * * * *',
  $job$
    SELECT net.http_post(
      url := 'https://esvrhnlwquunsdduvbnr.supabase.co/functions/v1/appointment-reminder-runner',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-rutex-cron-secret',
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'rutex_internal_cron_secret')
      ),
      body := '{"minutesAhead":1440}'::jsonb
    );
  $job$
);

SELECT cron.schedule(
  'director-sweep',
  '*/15 * * * *',
  $job$
    SELECT net.http_post(
      url := 'https://esvrhnlwquunsdduvbnr.supabase.co/functions/v1/director-sweep',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-rutex-cron-secret',
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'rutex_internal_cron_secret')
      ),
      body := '{"sweep":true}'::jsonb
    );
  $job$
);
 THEN
    RAISE EXCEPTION 'invalid_supabase_url' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'rutex_internal_cron_secret'
      AND octet_length(decrypted_secret) >= 32
  ) THEN
    RAISE EXCEPTION 'internal_cron_secret_not_configured';
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'appointment-reminders-24h') THEN
    PERFORM cron.unschedule('appointment-reminders-24h');
  END IF;

  PERFORM cron.schedule(
    'appointment-reminders-24h',
    '0 * * * *',
    format(
      $command$SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-rutex-cron-secret',
          (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'rutex_internal_cron_secret')
        ),
        body := '{"minutesAhead":1440}'::jsonb
      );$command$,
      p_supabase_url || '/functions/v1/appointment-reminder-runner'
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.schedule_appointment_reminder_cron(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_appointment_reminder_cron(text, text)
  TO service_role;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN ('plan-worker-sweep', 'appointment-reminders-24h', 'director-sweep');

SELECT cron.schedule(
  'plan-worker-sweep',
  '* * * * *',
  $job$
    SELECT net.http_post(
      url := 'https://esvrhnlwquunsdduvbnr.supabase.co/functions/v1/plan-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-rutex-cron-secret',
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'rutex_internal_cron_secret')
      ),
      body := '{"sweep":true}'::jsonb
    );
  $job$
);

SELECT cron.schedule(
  'appointment-reminders-24h',
  '0 * * * *',
  $job$
    SELECT net.http_post(
      url := 'https://esvrhnlwquunsdduvbnr.supabase.co/functions/v1/appointment-reminder-runner',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-rutex-cron-secret',
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'rutex_internal_cron_secret')
      ),
      body := '{"minutesAhead":1440}'::jsonb
    );
  $job$
);

SELECT cron.schedule(
  'director-sweep',
  '*/15 * * * *',
  $job$
    SELECT net.http_post(
      url := 'https://esvrhnlwquunsdduvbnr.supabase.co/functions/v1/director-sweep',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-rutex-cron-secret',
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'rutex_internal_cron_secret')
      ),
      body := '{"sweep":true}'::jsonb
    );
  $job$
);
