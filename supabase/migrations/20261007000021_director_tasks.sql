-- Director tasks: goals that drive themselves to DONE or BLOCKED.
--
-- A task is the unit of autonomy above single tool calls: the brain
-- (or the owner, or the sweep) states a goal once, and the task
-- driver iterates observe → decide → act → re-observe until the goal
-- is visibly met, blocked, or budgeted out. State persists per step,
-- so a timed-out run call resumes exactly where it stopped via
-- continue — pause is rows, same as every other channel here.
-- RLS: service role owns reads/writes (gateway + owner lanes inside
-- the edge enforce identity). No client policies = deny by default.

CREATE TABLE IF NOT EXISTS public.director_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal text NOT NULL,
  lane text NOT NULL DEFAULT 'inapp' CHECK (lane IN ('inapp', 'device')),
  device_id uuid REFERENCES public.companion_devices(id) ON DELETE CASCADE,
  budget integer NOT NULL DEFAULT 12,
  history jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'done', 'blocked', 'failed')),
  result text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_director_tasks_user
  ON public.director_tasks(user_id, updated_at DESC);

ALTER TABLE public.director_tasks ENABLE ROW LEVEL SECURITY;
