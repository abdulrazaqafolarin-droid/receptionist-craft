DO $$
BEGIN
  IF has_function_privilege(
    'anon',
    'public.create_widget_appointment(uuid,text,text,timestamptz,timestamptz,text,text,uuid,text,text,text,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'anon must not call raw appointment creation RPC';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.create_widget_appointment(uuid,text,text,timestamptz,timestamptz,text,text,uuid,text,text,text,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated clients must use validated server-side booking flow';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'public.create_widget_appointment(uuid,text,text,timestamptz,timestamptz,text,text,uuid,text,text,text,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'service_role must retain server-side booking access';
  END IF;
END $$;
