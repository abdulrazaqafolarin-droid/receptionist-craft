-- Security regression checks for read-only safe views.
-- Run after applying migrations to a disposable database with Supabase roles.
DO $$
DECLARE
  view_name text;
  views text[] := ARRAY[
    'public.companion_devices_safe',
    'public.plan_limits',
    'public.vault_keys_safe'
  ];
  role_name text;
BEGIN
  FOREACH view_name IN ARRAY views LOOP
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF NOT has_table_privilege(role_name, view_name, 'SELECT') THEN
        RAISE EXCEPTION '% must retain SELECT on %', role_name, view_name;
      END IF;

      IF has_table_privilege(role_name, view_name, 'INSERT')
        OR has_table_privilege(role_name, view_name, 'UPDATE')
        OR has_table_privilege(role_name, view_name, 'DELETE')
        OR has_table_privilege(role_name, view_name, 'TRUNCATE')
        OR has_table_privilege(role_name, view_name, 'REFERENCES')
        OR has_table_privilege(role_name, view_name, 'TRIGGER') THEN
        RAISE EXCEPTION '% must not have mutation/DDL privileges on %', role_name, view_name;
      END IF;
    END LOOP;
  END LOOP;
END
$$;
