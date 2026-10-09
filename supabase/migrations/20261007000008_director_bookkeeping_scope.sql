-- Director grants: add the bookkeeping scope for solo internal work.
--
-- The sweep writes only what live rows prove (completed-order stock
-- decrements, verifiable task states). That authority is distinct from
-- small fixes, so it gets its own scope rather than hiding inside
-- fix_small. Owners enable it in the Director grants panel.

ALTER TABLE public.director_grants
  DROP CONSTRAINT director_grants_scope_check;

ALTER TABLE public.director_grants
  ADD CONSTRAINT director_grants_scope_check
  CHECK (scope IN ('build_helpers', 'fix_small', 'connect', 'content', 'bookkeeping'));
