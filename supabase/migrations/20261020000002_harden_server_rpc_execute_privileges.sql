-- Fail closed for newly created functions: callers must receive EXECUTE explicitly.
-- The global PUBLIC revoke is necessary because per-schema REVOKE cannot override
-- PostgreSQL's global default EXECUTE grant to PUBLIC.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, service_role;

-- These are server-side maintenance or write operations. Public widget access
-- should go through the authenticated Edge Function boundary, not direct RPC.
REVOKE EXECUTE ON FUNCTION public.cleanup_old_booking_suggestions(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_booking_suggestions(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_chat_messages(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_chat_messages(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_conversation_state(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_conversation_state(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_conversations(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_conversations(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.deduct_stock(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_stock(uuid, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.insert_booking_suggestion(uuid, text, jsonb, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_booking_suggestion(uuid, text, jsonb, text, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.insert_conversion_event(uuid, text, text, numeric, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_conversion_event(uuid, text, text, numeric, text, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.upsert_conversation_state(uuid, text, text, text, text, double precision, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_conversation_state(uuid, text, text, text, text, double precision, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.upsert_conversation_summary(uuid, text, text, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_conversation_summary(uuid, text, text, jsonb, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.create_widget_appointment(
  uuid, text, text, timestamptz, timestamptz, text, text, uuid, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_widget_appointment(
  uuid, text, text, timestamptz, timestamptz, text, text, uuid, text, text, text, jsonb
) TO service_role;
