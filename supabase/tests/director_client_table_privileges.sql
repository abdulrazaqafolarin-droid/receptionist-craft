-- Run after the Director/public table privilege migration in disposable PostgreSQL 17.
DO $public_table_privileges$
DECLARE
  table_name text;
  role_name text;
  rls_enabled boolean;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'appointments', 'director_tasks', 'director_commands', 'director_messages',
    'director_threads', 'future_postgres_table', 'future_supabase_admin_table'
  ] LOOP
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_table_privilege(role_name, format('public.%I', table_name), 'TRUNCATE')
         OR has_table_privilege(role_name, format('public.%I', table_name), 'REFERENCES')
         OR has_table_privilege(role_name, format('public.%I', table_name), 'TRIGGER')
         OR has_table_privilege(role_name, format('public.%I', table_name), 'MAINTAIN') THEN
        RAISE EXCEPTION '% must not have TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on %', role_name, table_name;
      END IF;
    END LOOP;
  END LOOP;

  IF has_table_privilege('anon', 'public.director_commands', 'SELECT')
     OR has_table_privilege('anon', 'public.director_commands', 'INSERT')
     OR has_table_privilege('anon', 'public.director_commands', 'UPDATE')
     OR has_table_privilege('anon', 'public.director_commands', 'DELETE')
     OR has_table_privilege('authenticated', 'public.director_commands', 'INSERT')
     OR has_table_privilege('authenticated', 'public.director_commands', 'DELETE')
     OR NOT has_table_privilege('authenticated', 'public.director_commands', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.director_commands', 'UPDATE') THEN
    RAISE EXCEPTION 'director_commands grants must match owner read/complete semantics';
  END IF;

  IF has_table_privilege('anon', 'public.director_messages', 'SELECT')
     OR has_table_privilege('anon', 'public.director_threads', 'SELECT') THEN
    RAISE EXCEPTION 'anon must not access Director conversation tables';
  END IF;

  FOREACH table_name IN ARRAY ARRAY['director_messages', 'director_threads'] LOOP
    IF NOT has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT')
       OR NOT has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT')
       OR NOT has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE')
       OR NOT has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE') THEN
      RAISE EXCEPTION 'authenticated must retain owner CRUD grants on %', table_name;
    END IF;
  END LOOP;

  FOREACH table_name IN ARRAY ARRAY['director_commands', 'director_messages', 'director_threads'] LOOP
    IF NOT has_table_privilege('service_role', format('public.%I', table_name), 'SELECT')
       OR NOT has_table_privilege('service_role', format('public.%I', table_name), 'INSERT')
       OR NOT has_table_privilege('service_role', format('public.%I', table_name), 'UPDATE')
       OR NOT has_table_privilege('service_role', format('public.%I', table_name), 'DELETE') THEN
      RAISE EXCEPTION 'service_role must retain access to %', table_name;
    END IF;
  END LOOP;

  FOREACH table_name IN ARRAY ARRAY['appointments', 'director_tasks', 'director_commands', 'director_messages', 'director_threads'] LOOP
    SELECT c.relrowsecurity INTO rls_enabled
    FROM pg_class c
    WHERE c.oid = format('public.%I', table_name)::regclass;
    IF NOT rls_enabled THEN
      RAISE EXCEPTION 'RLS must remain enabled on %', table_name;
    END IF;
  END LOOP;
END $public_table_privileges$;
