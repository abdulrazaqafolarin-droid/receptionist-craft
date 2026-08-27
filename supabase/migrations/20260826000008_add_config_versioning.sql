-- Vision: Configuration Versioning & Plan Artifact

-- Every configuration change gets snapshotted for rollback
CREATE TABLE IF NOT EXISTS public.config_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  version_number  INTEGER NOT NULL,
  -- The OperationsConfig JSON at this version
  config_json     JSONB NOT NULL,
  -- The plain-language plan that was approved to produce this config
  plan_text       TEXT,
  -- What triggered this version: 'onboarding', 'owner_change', 'auto_revert', 'platform_update'
  change_source   TEXT NOT NULL DEFAULT 'owner_change',
  -- The owner's original words that prompted this change
  owner_input     TEXT,
  -- Who approved (null for auto-generated during onboarding)
  approved_by     UUID,
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_config_versions_unique
  ON public.config_versions(receptionist_id, version_number);

CREATE INDEX IF NOT EXISTS idx_config_versions_receptionist
  ON public.config_versions(receptionist_id, created_at DESC);

-- RLS
ALTER TABLE public.config_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can view own config versions" ON public.config_versions
  FOR SELECT USING (
    receptionist_id IN (
      SELECT id FROM public.receptionists WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage config versions" ON public.config_versions
  FOR ALL USING (true);

-- Operator plan artifact — the plain-language plan the owner approved
CREATE TABLE IF NOT EXISTS public.operator_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  config_version_id UUID REFERENCES public.config_versions(id) ON DELETE SET NULL,
  -- The plain-language plan text
  plan_text       TEXT NOT NULL,
  -- Structured sections for UI rendering
  plan_sections   JSONB NOT NULL DEFAULT '[]',
  -- Status: 'draft', 'pending_approval', 'approved', 'superseded'
  status          TEXT NOT NULL DEFAULT 'draft',
  -- The owner's response/feedback on the plan
  owner_feedback  TEXT,
  -- Version number for display
  display_version TEXT NOT NULL DEFAULT '1.0',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_operator_plans_receptionist
  ON public.operator_plans(receptionist_id, created_at DESC);

-- RLS
ALTER TABLE public.operator_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can view own operator plans" ON public.operator_plans
  FOR SELECT USING (
    receptionist_id IN (
      SELECT id FROM public.receptionists WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage operator plans" ON public.operator_plans
  FOR ALL USING (true);
