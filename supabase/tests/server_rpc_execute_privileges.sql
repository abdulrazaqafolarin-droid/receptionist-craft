-- Run after 20261020000002_harden_server_rpc_execute_privileges.sql in PostgreSQL 17.
DO $server_rpc_privileges$
DECLARE
  fn regprocedure;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.cleanup_old_booking_suggestions(integer)'::regprocedure,
    'public.cleanup_old_chat_messages(integer)'::regprocedure,
    'public.cleanup_old_conversation_state(integer)'::regprocedure,
    'public.cleanup_old_conversations(integer)'::regprocedure,
    'public.deduct_stock(uuid,integer)'::regprocedure,
    'public.insert_booking_suggestion(uuid,text,jsonb,text,integer)'::regprocedure,
    'public.insert_conversion_event(uuid,text,text,numeric,text,jsonb)'::regprocedure,
    'public.upsert_conversation_state(uuid,text,text,text,text,double precision,jsonb)'::regprocedure,
    'public.upsert_conversation_summary(uuid,text,text,jsonb,text)'::regprocedure,
    'public.create_widget_appointment(uuid,text,text,timestamptz,timestamptz,text,text,uuid,text,text,text,jsonb)'::regprocedure
  ] LOOP
    IF has_function_privilege('anon', fn, 'EXECUTE')
       OR has_function_privilege('authenticated', fn, 'EXECUTE')
       OR NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'Server-only function privilege boundary failed for %', fn;
    END IF;
  END LOOP;

  IF has_function_privilege('anon', 'public.future_postgres_rpc()'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.future_postgres_rpc()'::regprocedure, 'EXECUTE')
     OR has_function_privilege('service_role', 'public.future_postgres_rpc()'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'Future postgres-owned functions must require explicit EXECUTE grants';
  END IF;

  IF has_function_privilege('anon', 'public.future_supabase_admin_rpc()'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.future_supabase_admin_rpc()'::regprocedure, 'EXECUTE')
     OR has_function_privilege('service_role', 'public.future_supabase_admin_rpc()'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'Future supabase_admin-owned functions must require explicit EXECUTE grants';
  END IF;
END $server_rpc_privileges$;
