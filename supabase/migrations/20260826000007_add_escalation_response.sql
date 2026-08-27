-- Phase 7 enhancement: Two-way escalation response

ALTER TABLE public.escalations
  ADD COLUMN IF NOT EXISTS owner_response TEXT,
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;
