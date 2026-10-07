-- Build threads: ChatGPT-style conversation history for "build by talking
-- it through". Each thread is one build conversation: its messages, the
-- business context it started with, the operator it produced (if any), and
-- where the build stands. Owners resume any thread and keep chatting.
--
-- Only dialogue turns are stored (user + interview assistant replies), not
-- transient system notices — a restored thread reads as the conversation
-- it was, without references to UI state that no longer exists.

CREATE TABLE IF NOT EXISTS build_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receptionist_id uuid REFERENCES receptionists(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'New build',
  business_name text NOT NULL DEFAULT '',
  business_type text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'chatting'
    CHECK (status IN ('chatting', 'planned', 'approved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS build_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES build_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_build_threads_user ON build_threads(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_build_messages_thread ON build_messages(thread_id, created_at ASC);

-- Bumping the thread on every message keeps the list ordered by recent
-- activity, ChatGPT-style, without trusting the client clock.
CREATE OR REPLACE FUNCTION public.touch_build_thread()
RETURNS trigger AS $$
BEGIN
  UPDATE public.build_threads SET updated_at = now() WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_touch_build_thread ON public.build_messages;
CREATE TRIGGER trg_touch_build_thread
  AFTER INSERT ON public.build_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_build_thread();

ALTER TABLE public.build_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.build_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners manage own build threads" ON public.build_threads;
CREATE POLICY "owners manage own build threads" ON public.build_threads
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "owners manage messages of own threads" ON public.build_messages;
CREATE POLICY "owners manage messages of own threads" ON public.build_messages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.build_threads t
            WHERE t.id = build_messages.thread_id AND t.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.build_threads t
            WHERE t.id = build_messages.thread_id AND t.user_id = auth.uid())
  );
