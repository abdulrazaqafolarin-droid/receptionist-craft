-- Reduce client SQL privileges on Director tables whose RLS policies
-- already define the intended access surface. This is a least-privilege change:
-- it does not add any new data access or relax any RLS policy.

-- General Director tasks are server-managed. The live table has RLS enabled
-- and no client policies; Edge Functions using service_role own task lifecycle.
REVOKE ALL ON TABLE public.director_tasks FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.director_tasks TO service_role;

-- Commands and requests are user-readable and user-answerable, but clients do
-- not create/delete queue rows. RLS still scopes SELECT/UPDATE to auth.uid().
REVOKE ALL ON TABLE public.director_commands FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.director_commands TO authenticated;
GRANT ALL ON TABLE public.director_commands TO service_role;

REVOKE ALL ON TABLE public.director_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.director_requests TO authenticated;
GRANT ALL ON TABLE public.director_requests TO service_role;

-- Actions have an explicit owner-scoped ALL policy; preserve authenticated
-- owner CRUD while removing grants from unauthenticated clients.
REVOKE ALL ON TABLE public.director_actions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.director_actions TO authenticated;
GRANT ALL ON TABLE public.director_actions TO service_role;
