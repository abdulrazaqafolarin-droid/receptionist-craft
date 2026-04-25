-- Add release gate controls for A/B tests so "complete" status is blocked
-- until all KPI gates pass at each configured interval.

ALTER TABLE public.ab_tests
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'running'
  CHECK (status IN ('draft', 'running', 'complete', 'archived'));

CREATE TABLE IF NOT EXISTS public.ab_test_release_gate_intervals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES public.ab_tests(id) ON DELETE CASCADE,
  interval_key TEXT NOT NULL CHECK (interval_key IN ('7d', '14d', '30d')),
  min_observation_period INTERVAL NOT NULL,
  conversion_uplift_target NUMERIC(6,4) NOT NULL,
  attributed_revenue_uplift_target NUMERIC(6,4) NOT NULL,
  lead_capture_uplift_target NUMERIC(6,4) NOT NULL,
  leakage_reduction_target NUMERIC(6,4) NOT NULL,
  no_show_reduction_target NUMERIC(6,4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (test_id, interval_key)
);

CREATE TABLE IF NOT EXISTS public.ab_test_release_gate_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES public.ab_tests(id) ON DELETE CASCADE,
  interval_key TEXT NOT NULL CHECK (interval_key IN ('7d', '14d', '30d')),
  observed_period INTERVAL NOT NULL DEFAULT interval '0 day',
  conversion_uplift NUMERIC(6,4),
  attributed_revenue_uplift NUMERIC(6,4),
  lead_capture_uplift NUMERIC(6,4),
  leakage_reduction NUMERIC(6,4),
  no_show_reduction NUMERIC(6,4),
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (test_id, interval_key)
);

CREATE INDEX IF NOT EXISTS idx_ab_test_release_gate_intervals_test_id
  ON public.ab_test_release_gate_intervals(test_id);

CREATE INDEX IF NOT EXISTS idx_ab_test_release_gate_results_test_id
  ON public.ab_test_release_gate_results(test_id);

-- Seed default KPI release gates for existing tests.
-- Metric values are proportions (e.g., 0.0500 = 5.00% uplift/reduction).
INSERT INTO public.ab_test_release_gate_intervals (
  test_id,
  interval_key,
  min_observation_period,
  conversion_uplift_target,
  attributed_revenue_uplift_target,
  lead_capture_uplift_target,
  leakage_reduction_target,
  no_show_reduction_target
)
SELECT
  t.id,
  cfg.interval_key,
  cfg.min_observation_period,
  cfg.conversion_uplift_target,
  cfg.attributed_revenue_uplift_target,
  cfg.lead_capture_uplift_target,
  cfg.leakage_reduction_target,
  cfg.no_show_reduction_target
FROM public.ab_tests t
CROSS JOIN (
  VALUES
    ('7d'::TEXT, interval '7 days', 0.0300::NUMERIC, 0.0400::NUMERIC, 0.0300::NUMERIC, 0.0500::NUMERIC, 0.0500::NUMERIC),
    ('14d'::TEXT, interval '14 days', 0.0500::NUMERIC, 0.0700::NUMERIC, 0.0500::NUMERIC, 0.0800::NUMERIC, 0.0800::NUMERIC),
    ('30d'::TEXT, interval '30 days', 0.0800::NUMERIC, 0.1000::NUMERIC, 0.0700::NUMERIC, 0.1200::NUMERIC, 0.1200::NUMERIC)
) AS cfg(
  interval_key,
  min_observation_period,
  conversion_uplift_target,
  attributed_revenue_uplift_target,
  lead_capture_uplift_target,
  leakage_reduction_target,
  no_show_reduction_target
)
ON CONFLICT (test_id, interval_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.touch_ab_test_release_gate_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_ab_test_release_gate_intervals ON public.ab_test_release_gate_intervals;
CREATE TRIGGER trg_touch_ab_test_release_gate_intervals
BEFORE UPDATE ON public.ab_test_release_gate_intervals
FOR EACH ROW
EXECUTE FUNCTION public.touch_ab_test_release_gate_updated_at();

DROP TRIGGER IF EXISTS trg_touch_ab_test_release_gate_results ON public.ab_test_release_gate_results;
CREATE TRIGGER trg_touch_ab_test_release_gate_results
BEFORE UPDATE ON public.ab_test_release_gate_results
FOR EACH ROW
EXECUTE FUNCTION public.touch_ab_test_release_gate_updated_at();

CREATE OR REPLACE FUNCTION public.ab_test_kpi_gates_pass(p_test_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.ab_test_release_gate_intervals gi
      WHERE gi.test_id = p_test_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.ab_test_release_gate_intervals gi
      LEFT JOIN public.ab_test_release_gate_results gr
        ON gr.test_id = gi.test_id
       AND gr.interval_key = gi.interval_key
      WHERE gi.test_id = p_test_id
        AND (
          gr.id IS NULL
          OR gr.observed_period < gi.min_observation_period
          OR COALESCE(gr.conversion_uplift, -1) < gi.conversion_uplift_target
          OR COALESCE(gr.attributed_revenue_uplift, -1) < gi.attributed_revenue_uplift_target
          OR COALESCE(gr.lead_capture_uplift, -1) < gi.lead_capture_uplift_target
          OR COALESCE(gr.leakage_reduction, -1) < gi.leakage_reduction_target
          OR COALESCE(gr.no_show_reduction, -1) < gi.no_show_reduction_target
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.enforce_ab_test_release_gates()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'complete' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT public.ab_test_kpi_gates_pass(NEW.id) THEN
      RAISE EXCEPTION
        'Cannot mark ab_tests.id=% as complete: one or more KPI release gates failed or minimum observation periods are unmet.',
        NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_ab_test_release_gates ON public.ab_tests;
CREATE TRIGGER trg_enforce_ab_test_release_gates
BEFORE UPDATE OF status ON public.ab_tests
FOR EACH ROW
EXECUTE FUNCTION public.enforce_ab_test_release_gates();

ALTER TABLE public.ab_test_release_gate_intervals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_test_release_gate_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view ab_test_release_gate_intervals"
  ON public.ab_test_release_gate_intervals FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view ab_test_release_gate_results"
  ON public.ab_test_release_gate_results FOR SELECT
  USING (auth.uid() IS NOT NULL);
