-- director_tasks is a server-managed queue. RLS with no policies blocks row
-- access, but it does not protect TRUNCATE; remove broad client table grants.
REVOKE ALL ON TABLE public.director_tasks FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.director_tasks TO service_role;
