-- Run after 20261016000003_director_table_least_privilege.sql in an isolated DB.
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.director_tasks', 'SELECT')
     OR has_table_privilege('anon', 'public.director_tasks', 'INSERT')
     OR has_table_privilege('authenticated', 'public.director_tasks', 'SELECT')
     OR has_table_privilege('authenticated', 'public.director_tasks', 'INSERT') THEN
    RAISE EXCEPTION 'director_tasks must be service-role only';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.director_tasks', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.director_tasks', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.director_tasks', 'UPDATE') THEN
    RAISE EXCEPTION 'service_role must retain Director task access';
  END IF;

  IF has_table_privilege('anon', 'public.director_commands', 'SELECT')
     OR has_table_privilege('anon', 'public.director_commands', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.director_commands', 'INSERT')
     OR has_table_privilege('authenticated', 'public.director_commands', 'DELETE')
     OR NOT has_table_privilege('authenticated', 'public.director_commands', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.director_commands', 'UPDATE') THEN
    RAISE EXCEPTION 'director_commands client grants do not match SELECT/UPDATE-only policy surface';
  END IF;

  IF has_table_privilege('anon', 'public.director_requests', 'SELECT')
     OR has_table_privilege('anon', 'public.director_requests', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.director_requests', 'INSERT')
     OR has_table_privilege('authenticated', 'public.director_requests', 'DELETE')
     OR NOT has_table_privilege('authenticated', 'public.director_requests', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.director_requests', 'UPDATE') THEN
    RAISE EXCEPTION 'director_requests client grants do not match SELECT/UPDATE-only policy surface';
  END IF;

  IF has_table_privilege('anon', 'public.director_actions', 'SELECT')
     OR has_table_privilege('anon', 'public.director_actions', 'INSERT')
     OR has_table_privilege('anon', 'public.director_actions', 'UPDATE')
     OR has_table_privilege('anon', 'public.director_actions', 'DELETE')
     OR NOT has_table_privilege('authenticated', 'public.director_actions', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.director_actions', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.director_actions', 'UPDATE')
     OR NOT has_table_privilege('authenticated', 'public.director_actions', 'DELETE') THEN
    RAISE EXCEPTION 'director_actions should retain authenticated owner CRUD only';
  END IF;
END $$;
