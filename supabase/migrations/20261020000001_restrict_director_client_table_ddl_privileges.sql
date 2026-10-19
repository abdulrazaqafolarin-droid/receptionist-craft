-- Remove non-row-level privileges from public-facing roles across existing public tables.
-- RLS does not protect TRUNCATE, REFERENCES, TRIGGER, or MAINTAIN.
-- Preserve existing SELECT/INSERT/UPDATE/DELETE grants except for the Director
-- tables below, whose intended client DML access is narrower.
DO $revoke_public_table_ddl$
DECLARE
  table_row record;
BEGIN
  FOR table_row IN
    SELECT n.nspname, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format(
      'REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE %I.%I FROM PUBLIC, anon, authenticated',
      table_row.nspname,
      table_row.relname
    );
  END LOOP;
END $revoke_public_table_ddl$;

-- Future tables created by either migration/dashboard owner must not inherit
-- table-wide DDL/maintenance privileges for browser-facing roles.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES FROM PUBLIC, anon, authenticated;

-- The command queue is only read and completed by its owning authenticated
-- browser; inserts and deletes are server-managed.
REVOKE ALL ON TABLE public.director_commands FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.director_commands TO authenticated;

-- Conversation threads/messages intentionally support owner-scoped CRUD via
-- their existing RLS policies. Remove anonymous access and restore only those
-- authenticated row operations, never table-wide DDL privileges.
REVOKE ALL ON TABLE public.director_messages, public.director_threads FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.director_messages, public.director_threads TO authenticated;

GRANT ALL ON TABLE public.director_commands, public.director_messages, public.director_threads TO service_role;
