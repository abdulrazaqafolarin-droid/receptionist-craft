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
