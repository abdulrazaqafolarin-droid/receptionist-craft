-- Fix receptionists RLS to support organization-based access
-- This allows organization members to access receptionists belonging to their organization

-- Drop existing policies on receptionists
DROP POLICY IF EXISTS "Users can view own receptionists" ON public.receptionists;
DROP POLICY IF EXISTS "Users can create own receptionists" ON public.receptionists;
DROP POLICY IF EXISTS "Users can update own receptionists" ON public.receptionists;
DROP POLICY IF EXISTS "Users can delete own receptionists" ON public.receptionists;

-- New policies that support both solo users (user_id) and organization members
CREATE POLICY "Users can view own receptionists or org receptionists"
  ON public.receptionists FOR SELECT
  USING (
    auth.uid() = user_id
    OR organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
  );

CREATE POLICY "Users can create own receptionists or org receptionists"
  ON public.receptionists FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
  );

CREATE POLICY "Users can update own receptionists or org receptionists"
  ON public.receptionists FOR UPDATE
  USING (
    auth.uid() = user_id
    OR (
      organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
      AND (
        public.has_org_role(auth.uid(), organization_id, 'owner') 
        OR public.has_org_role(auth.uid(), organization_id, 'admin')
      )
    )
  );

CREATE POLICY "Users can delete own receptionists or org receptionists"
  ON public.receptionists FOR DELETE
  USING (
    auth.uid() = user_id
    OR (
      organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
      AND public.has_org_role(auth.uid(), organization_id, 'owner')
    )
  );

-- Also fix staff table RLS for organization access
DROP POLICY IF EXISTS "Users can view own staff" ON public.staff;
DROP POLICY IF EXISTS "Users can create own staff" ON public.staff;
DROP POLICY IF EXISTS "Users can update own staff" ON public.staff;
DROP POLICY IF EXISTS "Users can delete own staff" ON public.staff;

-- Check if staff table has organization_id or location_id
-- If not, we'll need to add it. For now, use receptionist_id to join
CREATE POLICY "Users can view own staff or org staff"
  ON public.staff FOR SELECT
  USING (
    receptionist_id IN (
      SELECT id FROM public.receptionists 
      WHERE user_id = auth.uid() 
      OR organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
    )
  );

CREATE POLICY "Users can create own staff or org staff"
  ON public.staff FOR INSERT
  WITH CHECK (
    receptionist_id IN (
      SELECT id FROM public.receptionists 
      WHERE user_id = auth.uid() 
      OR organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
    )
  );

CREATE POLICY "Users can update own staff or org staff"
  ON public.staff FOR UPDATE
  USING (
    receptionist_id IN (
      SELECT id FROM public.receptionists 
      WHERE user_id = auth.uid() 
      OR organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
    )
  );

CREATE POLICY "Users can delete own staff or org staff"
  ON public.staff FOR DELETE
  USING (
    receptionist_id IN (
      SELECT id FROM public.receptionists 
      WHERE user_id = auth.uid() 
      OR organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
    )
  );
