-- Run after secure_director_task_table_grants.sql in a disposable database.
DO $director_task_grants$
DECLARE
  role_name text;
  rls_enabled boolean;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_table_privilege(role_name, 'public.director_tasks', 'SELECT')
       OR has_table_privilege(role_name, 'public.director_tasks', 'INSERT')
       OR has_table_privilege(role_name, 'public.director_tasks', 'UPDATE')
       OR has_table_privilege(role_name, 'public.director_tasks', 'DELETE')
       OR has_table_privilege(role_name, 'public.director_tasks', 'TRUNCATE')
       OR has_table_privilege(role_name, 'public.director_tasks', 'REFERENCES')
       OR has_table_privilege(role_name, 'public.director_tasks', 'TRIGGER') THEN
      RAISE EXCEPTION '% must not have any direct privileges on server-managed director_tasks', role_name;
    END IF;
  END LOOP;

  IF NOT has_table_privilege('service_role', 'public.director_tasks', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.director_tasks', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.director_tasks', 'UPDATE')
     OR NOT has_table_privilege('service_role', 'public.director_tasks', 'DELETE') THEN
    RAISE EXCEPTION 'service_role must retain the Director task read/write path';
  END IF;

  SELECT c.relrowsecurity INTO rls_enabled
  FROM pg_class c
  WHERE c.oid = 'public.director_tasks'::regclass;
  IF NOT rls_enabled THEN
    RAISE EXCEPTION 'director_tasks must remain protected by RLS';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'director_tasks') THEN
    RAISE EXCEPTION 'server-only director_tasks should not gain client-facing RLS policies';
  END IF;
END $director_task_grants$;
