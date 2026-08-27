-- Phase 7: Human Escalation Path

CREATE TABLE IF NOT EXISTS public.escalations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  session_id      TEXT NOT NULL,
  customer_name   TEXT,
  customer_email  TEXT,
  customer_phone  TEXT,
  reason          TEXT NOT NULL,
  summary         TEXT,
  status          TEXT NOT NULL DEFAULT 'open',
  resolved_by     TEXT,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_escalations_receptionist ON public.escalations(receptionist_id);
CREATE INDEX IF NOT EXISTS idx_escalations_status ON public.escalations(status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_escalations_session ON public.escalations(session_id);

-- RLS
ALTER TABLE public.escalations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can view escalations" ON public.escalations
  FOR SELECT USING (
    receptionist_id IN (
      SELECT id FROM public.receptionists WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage escalations" ON public.escalations
  FOR ALL USING (true);
