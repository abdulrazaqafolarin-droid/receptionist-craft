-- Preserve intended owner-level row access while removing unsafe table-wide DDL privileges.
-- RLS does not protect TRUNCATE, REFERENCES, or TRIGGER privileges.
-- director_commands are server-inserted and owner-readable/updatable only.
-- director_threads and director_messages remain owner-managed through RLS.

REVOKE ALL ON TABLE public.director_commands, public.director_messages, public.director_threads
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, UPDATE ON TABLE public.director_commands TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.director_threads, public.director_messages
  TO authenticated;

GRANT ALL ON TABLE public.director_commands, public.director_messages, public.director_threads
  TO service_role;
