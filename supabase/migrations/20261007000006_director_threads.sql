-- Director chat threads: same row shape as build_threads so the same hook
-- and list UI serve both doors. Director threads are owner-wide (no single
-- operator); receptionist_id stays null unless a chat narrows to one.

CREATE TABLE IF NOT EXISTS public.director_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receptionist_id uuid REFERENCES public.receptionists(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Director chat',
  business_name text NOT NULL DEFAULT '',
  business_type text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'chatting'
    CHECK (status IN ('chatting', 'planned', 'approved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.director_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.director_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_director_threads_user
  ON public.director_threads(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_director_messages_thread
  ON public.director_messages(thread_id, created_at ASC);

CREATE OR REPLACE FUNCTION public.touch_director_thread()
RETURNS trigger AS $$
BEGIN
  UPDATE public.director_threads SET updated_at = now() WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_touch_director_thread ON public.director_messages;
CREATE TRIGGER trg_touch_director_thread
  AFTER INSERT ON public.director_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_director_thread();

ALTER TABLE public.director_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.director_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners manage own director threads" ON public.director_threads;
CREATE POLICY "owners manage own director threads" ON public.director_threads
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "owners manage messages of own director threads" ON public.director_messages;
CREATE POLICY "owners manage messages of own director threads" ON public.director_messages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.director_threads t
            WHERE t.id = director_messages.thread_id AND t.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.director_threads t
            WHERE t.id = director_messages.thread_id AND t.user_id = auth.uid())
  );
