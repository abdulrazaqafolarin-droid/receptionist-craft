-- Add dedicated money mode columns on receptionists.
-- During transition, these columns are source of truth and capabilities JSON remains a compatibility mirror.
ALTER TABLE public.receptionists
  ADD COLUMN IF NOT EXISTS money_mode_enabled boolean,
  ADD COLUMN IF NOT EXISTS money_mode_threshold integer,
  ADD COLUMN IF NOT EXISTS money_mode_hold_until timestamptz,
  ADD COLUMN IF NOT EXISTS money_mode_hysteresis integer;

COMMENT ON COLUMN public.receptionists.money_mode_enabled IS
'Source-of-truth flag for money mode. capabilities.money_mode_enabled is compatibility mirror.';
COMMENT ON COLUMN public.receptionists.money_mode_threshold IS
'Source-of-truth threshold for money mode. capabilities.money_mode_threshold is compatibility mirror.';
COMMENT ON COLUMN public.receptionists.money_mode_hold_until IS
'Source-of-truth hold timestamp for money mode. capabilities.money_mode_hold_until is compatibility mirror.';
COMMENT ON COLUMN public.receptionists.money_mode_hysteresis IS
'Source-of-truth hysteresis value for money mode. capabilities.money_mode_hysteresis is compatibility mirror.';

-- Backfill from legacy capabilities JSON where available.
UPDATE public.receptionists
SET
  money_mode_enabled = COALESCE(
    money_mode_enabled,
    CASE
      WHEN jsonb_typeof(capabilities -> 'money_mode_enabled') = 'boolean'
        THEN (capabilities ->> 'money_mode_enabled')::boolean
      ELSE NULL
    END
  ),
  money_mode_threshold = COALESCE(
    money_mode_threshold,
    CASE
      WHEN jsonb_typeof(capabilities -> 'money_mode_threshold') = 'number'
        THEN GREATEST(1, LEAST(10, ROUND((capabilities ->> 'money_mode_threshold')::numeric)::integer))
      ELSE NULL
    END
  ),
  money_mode_hold_until = COALESCE(
    money_mode_hold_until,
    CASE
      WHEN jsonb_typeof(capabilities -> 'money_mode_hold_until') = 'string'
        THEN (capabilities ->> 'money_mode_hold_until')::timestamptz
      ELSE NULL
    END
  ),
  money_mode_hysteresis = COALESCE(
    money_mode_hysteresis,
    CASE
      WHEN jsonb_typeof(capabilities -> 'money_mode_hysteresis') = 'number'
        THEN GREATEST(0, ROUND((capabilities ->> 'money_mode_hysteresis')::numeric)::integer)
      ELSE NULL
    END
  );
