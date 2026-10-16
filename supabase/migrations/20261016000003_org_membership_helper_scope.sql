-- Keep organization-membership helper RPCs scoped to the caller.
-- RLS policies use these helpers with auth.uid(); the input argument must not
-- allow an authenticated caller to enumerate another user's memberships/roles.

CREATE OR REPLACE FUNCTION public.get_user_org_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = _user_id
    AND _user_id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.has_org_role(
  _user_id uuid,
  _org_id uuid,
  _role public.app_role
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT _user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.organization_members
      WHERE user_id = _user_id
        AND organization_id = _org_id
        AND role = _role
    );
$function$;

CREATE OR REPLACE FUNCTION public.is_org_member(
  _user_id uuid,
  _org_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT _user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.organization_members
      WHERE user_id = _user_id
        AND organization_id = _org_id
    );
$function$;

-- RLS policies are declared for PUBLIC and therefore also run for anon.
-- Keep execute permission for those policies, but make the helpers return no
-- data for anon and prevent authenticated users from supplying another user ID.
REVOKE ALL ON FUNCTION public.get_user_org_ids(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_org_role(uuid, uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_org_member(uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_user_org_ids(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, public.app_role) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO anon, authenticated, service_role;
