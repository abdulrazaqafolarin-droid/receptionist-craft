-- Director standing grants: what the Director may do solo.
--
-- A grant is the owner saying once what the Director need not ask twice.
-- Anything outside the granted scopes always comes back as a proposal.
-- Autonomous builds made under a grant land in config_versions with
-- change_source 'director' — never silent, always revertible.

CREATE TABLE IF NOT EXISTS public.director_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('build_helpers', 'fix_small', 'connect', 'content')),
  allowed boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, scope)
);

ALTER TABLE public.director_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners manage own director grants" ON public.director_grants;
CREATE POLICY "owners manage own director grants" ON public.director_grants
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
