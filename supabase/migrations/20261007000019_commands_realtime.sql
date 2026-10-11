-- Director commands on the live channel (missed in migration 13).
--
-- Without this, the browser executor subscribes to silence: pump runs
-- once on mount, queued commands never arrive, and every brain tool
-- call times out with "hands aren't answering". The table, policies,
-- and queue behavior are unchanged — this only opens the signal.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'director_commands'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.director_commands;
  END IF;
END;
$$;
