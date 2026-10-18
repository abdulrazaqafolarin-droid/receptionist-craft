-- Regression test for the guarded reminder scheduler on a disposable PostgreSQL DB.
-- Vault and pg_cron are represented by minimal fixtures; no real HTTP requests run.

DO $roles$
BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $roles$;
DO $roles$
BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $roles$;
DO $roles$
BEGIN
  CREATE ROLE service_role NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $roles$;

CREATE SCHEMA vault;
CREATE SCHEMA cron;
CREATE TABLE vault.secrets(name text PRIMARY KEY);
CREATE TABLE vault.decrypted_secrets(name text PRIMARY KEY, decrypted_secret text NOT NULL);
INSERT INTO vault.secrets(name) VALUES ('rutex_internal_cron_secret');
INSERT INTO vault.decrypted_secrets(name, decrypted_secret)
VALUES ('rutex_internal_cron_secret', repeat('test-secret-', 6));

CREATE TABLE cron.job(
  jobid bigserial PRIMARY KEY,
  jobname text UNIQUE NOT NULL,
  schedule text NOT NULL,
  command text NOT NULL
);

CREATE FUNCTION cron.schedule(p_jobname text, p_schedule text, p_command text)
RETURNS bigint LANGUAGE plpgsql AS $function$
DECLARE v_jobid bigint;
BEGIN
  INSERT INTO cron.job(jobname, schedule, command)
  VALUES (p_jobname, p_schedule, p_command)
  ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command
  RETURNING jobid INTO v_jobid;
  RETURN v_jobid;
END;
$function$;

CREATE FUNCTION cron.unschedule(p_jobid bigint)
RETURNS boolean LANGUAGE plpgsql AS $function$
BEGIN
  DELETE FROM cron.job WHERE jobid = p_jobid;
  RETURN FOUND;
END;
$function$;

CREATE FUNCTION cron.unschedule(p_jobname text)
RETURNS boolean LANGUAGE plpgsql AS $function$
BEGIN
  DELETE FROM cron.job WHERE jobname = p_jobname;
  RETURN FOUND;
END;
$function$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA cron TO PUBLIC;

-- Apply the actual migration with the fixture secret already present.
\i supabase/migrations/20261017000001_secure_internal_cron_jobs.sql

-- Simulate the later owner approval flow calling setup-reminder-cron. It must
-- preserve the same secret-authenticated schedule rather than replacing it
-- with an anon-key Authorization header.
SELECT public.schedule_appointment_reminder_cron(
  'https://esvrhnlwquunsdduvbnr.supabase.co',
  'test-anon-key-not-a-secret'
);

DO $assertions$
DECLARE v_command text;
BEGIN
  SELECT command INTO v_command FROM cron.job WHERE jobname = 'appointment-reminders-24h';
  IF v_command IS NULL THEN RAISE EXCEPTION 'appointment reminder job was not scheduled'; END IF;
  IF position('x-rutex-cron-secret' IN v_command) = 0 THEN
    RAISE EXCEPTION 'reminder job must send the internal cron secret header';
  END IF;
  IF position('vault.decrypted_secrets' IN v_command) = 0 THEN
    RAISE EXCEPTION 'reminder job must read the secret from Vault at execution time';
  END IF;
  IF position('Authorization' IN v_command) > 0 OR position('test-anon-key-not-a-secret' IN v_command) > 0 THEN
    RAISE EXCEPTION 'reminder job must not be downgraded to an anon-key Authorization header';
  END IF;
  IF position(repeat('test-secret-', 6) IN v_command) > 0 THEN
    RAISE EXCEPTION 'secret value must not be stored literally in cron.job.command';
  END IF;
  IF has_function_privilege('anon', 'public.schedule_appointment_reminder_cron(text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.schedule_appointment_reminder_cron(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'reminder scheduler RPC must not be callable by client roles';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.schedule_appointment_reminder_cron(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must retain reminder scheduler RPC execution';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.schedule_appointment_reminder_cron(text,text)'::regprocedure
      AND p.proconfig @> ARRAY['search_path=pg_catalog, public, cron, pg_temp']
  ) THEN
    RAISE EXCEPTION 'reminder scheduler RPC must have a fixed search_path';
  END IF;
END $assertions$;
