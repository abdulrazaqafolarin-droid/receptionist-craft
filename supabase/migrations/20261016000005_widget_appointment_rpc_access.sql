-- Appointment creation is validated and executed by the widget-chat server path.
-- Do not expose the raw SECURITY DEFINER insert RPC to browser callers: it does
-- not itself enforce availability or all booking business rules.

REVOKE ALL ON FUNCTION public.create_widget_appointment(
  uuid, text, text, timestamptz, timestamptz, text, text, uuid, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_widget_appointment(
  uuid, text, text, timestamptz, timestamptz, text, text, uuid, text, text, text, jsonb
) TO service_role;
