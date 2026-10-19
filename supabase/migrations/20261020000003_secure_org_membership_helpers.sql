-- Organization membership helpers are used by RLS policies. They must only
-- answer for the authenticated caller, and pending/unjoined membership rows
-- must never confer organization access.
CREATE OR REPLACE FUNCTION public.get_user_org_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT om.organization_id
  FROM public.organization_members AS om
  WHERE om.user_id = _user_id
    AND om.user_id = (SELECT auth.uid())
    AND om.joined_at IS NOT NULL;
$function$;

CREATE OR REPLACE FUNCTION public.has_org_role(_user_id uuid, _org_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members AS om
    WHERE om.user_id = _user_id
      AND om.user_id = (SELECT auth.uid())
      AND om.organization_id = _org_id
      AND om.role = _role
      AND om.joined_at IS NOT NULL
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members AS om
    WHERE om.user_id = _user_id
      AND om.user_id = (SELECT auth.uid())
      AND om.organization_id = _org_id
      AND om.joined_at IS NOT NULL
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.get_user_org_ids(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, public.app_role) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

-- These functions are called from RLS expressions as the signed-in user.
GRANT EXECUTE ON FUNCTION public.get_user_org_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO authenticated;
