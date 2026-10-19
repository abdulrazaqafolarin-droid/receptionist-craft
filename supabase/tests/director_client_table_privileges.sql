-- Run after 20261020000001_restrict_director_client_table_ddl_privileges.sql
-- in a disposable PostgreSQL database with representative roles and tables.
DO $director_client_table_privileges$
DECLARE
  table_name text;
  role_name text;
  rls_enabled boolean;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['director_commands', 'director_messages', 'director_threads'] LOOP
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_table_privilege(role_name, format('public.%I', table_name), 'TRUNCATE')
         OR has_table_privilege(role_name, format('public.%I', table_name), 'REFERENCES')
         OR has_table_privilege(role_name, format('public.%I', table_name), 'TRIGGER') THEN
        RAISE EXCEPTION '% must not have table-wide DDL privileges on %', role_name, table_name;
      END IF;
    END LOOP;

    IF has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
       OR has_table_privilege('anon', format('public.%I', table_name), 'INSERT')
       OR has_table_privilege('anon', format('public.%I', table_name), 'UPDATE')
       OR has_table_privilege('anon', format('public.%I', table_name), 'DELETE') THEN
      RAISE EXCEPTION 'anon must not have row-level privileges on %', table_name;
    END IF;

    IF NOT has_table_privilege('service_role', format('public.%I', table_name), 'SELECT')
       OR NOT has_table_privilege('service_role', format('public.%I', table_name), 'INSERT')
       OR NOT has_table_privilege('service_role', format('public.%I', table_name), 'UPDATE')
       OR NOT has_table_privilege('service_role', format('public.%I', table_name), 'DELETE') THEN
      RAISE EXCEPTION 'service_role must retain access to %', table_name;
    END IF;

    SELECT c.relrowsecurity INTO rls_enabled
    FROM pg_class c
    WHERE c.oid = format('public.%I', table_name)::regclass;
    IF NOT rls_enabled THEN
      RAISE EXCEPTION 'RLS must remain enabled on %', table_name;
    END IF;
  END LOOP;

  IF NOT has_table_privilege('authenticated', 'public.director_commands', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.director_commands', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.director_commands', 'INSERT')
     OR has_table_privilege('authenticated', 'public.director_commands', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated must retain only intended SELECT/UPDATE access to director_commands';
  END IF;

  FOREACH table_name IN ARRAY ARRAY['director_messages', 'director_threads'] LOOP
    IF NOT has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT')
       OR NOT has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT')
       OR NOT has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE')
       OR NOT has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE') THEN
      RAISE EXCEPTION 'authenticated must retain intended owner CRUD access to %', table_name;
    END IF;
  END LOOP;
END $director_client_table_privileges$;
