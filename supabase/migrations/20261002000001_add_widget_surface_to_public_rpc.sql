-- Expose the approved widget surface on get_public_receptionist
-- so the customer-facing widget assembles only the flows this operator
-- was approved for (booking pickers, product ordering, voice, lead form).
-- Booleans only — no operational detail leaks to anonymous callers.
-- Operators approved before ui_surface existed get NULL (widget shows everything).
-- Must DROP first because return type changed.

DROP FUNCTION IF EXISTS public.get_public_receptionist(uuid);

CREATE FUNCTION public.get_public_receptionist(p_receptionist_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  business_name text,
  greeting_message text,
  active boolean,
  timezone text,
  tone text,
  business_model text,
  widget_surface jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.name,
    r.business_name,
    r.greeting_message,
    r.active,
    r.timezone,
    r.tone::text,
    r.business_model,
    (r.capabilities -> 'ui_surface' -> 'widget')
  FROM public.receptionists r
  WHERE r.id = p_receptionist_id AND r.active = true;
$$;

-- Re-grant execute permissions (lost on DROP)
GRANT EXECUTE ON FUNCTION public.get_public_receptionist(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_receptionist(uuid) TO authenticated;
