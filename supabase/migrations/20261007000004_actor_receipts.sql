-- Actor run receipts: the permanent half of the audit surface.
--
-- The cursor is what the owner sees; this table is what remains. Every
-- guided tour worth remembering lands one row: which tour, whose operator,
-- how many steps, whether it finished clean. The dashboard renders the
-- recent ones as "recent guided activity". Fire-and-forget writes only —
-- a failed insert must never disturb a tour.

CREATE TABLE IF NOT EXISTS public.actor_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receptionist_id uuid REFERENCES public.receptionists(id) ON DELETE SET NULL,
  tour text NOT NULL DEFAULT 'ad-hoc',
  ok boolean NOT NULL DEFAULT true,
  steps integer NOT NULL DEFAULT 0,
  failed_detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_actor_receipts_user
  ON public.actor_receipts(user_id, created_at DESC);

ALTER TABLE public.actor_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners manage own actor receipts" ON public.actor_receipts;
CREATE POLICY "owners manage own actor receipts" ON public.actor_receipts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
