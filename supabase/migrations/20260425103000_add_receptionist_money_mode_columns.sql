-- Add dedicated money mode columns on receptionists.
ALTER TABLE public.receptionists
  ADD COLUMN IF NOT EXISTS money_mode_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS money_mode_threshold integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS money_mode_hold_until timestamptz NULL,
  ADD COLUMN IF NOT EXISTS money_mode_hysteresis integer NOT NULL DEFAULT 2;

COMMENT ON COLUMN public.receptionists.money_mode_enabled IS
'Source-of-truth toggle for Money Mode behavior.';
COMMENT ON COLUMN public.receptionists.money_mode_threshold IS
'Source-of-truth hotness threshold (1-10) to enter Money Mode.';
COMMENT ON COLUMN public.receptionists.money_mode_hold_until IS
'Source-of-truth timestamp to hold Money Mode until this time.';
COMMENT ON COLUMN public.receptionists.money_mode_hysteresis IS
'Source-of-truth hysteresis (points) required to exit Money Mode.';

CREATE OR REPLACE FUNCTION public.try_parse_timestamptz(input_text text)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF input_text IS NULL OR btrim(input_text) = '' THEN
    RETURN NULL;
  END IF;

  RETURN input_text::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- Backfill source-of-truth columns from legacy capabilities JSON where values are present.
UPDATE public.receptionists
SET
  money_mode_enabled = CASE
    WHEN jsonb_typeof(capabilities->'money_mode_enabled') = 'boolean'
      THEN (capabilities->>'money_mode_enabled')::boolean
    WHEN NOT COALESCE(capabilities ? 'money_mode_enabled', false) AND ai_mode = 'sales'
      THEN true
    ELSE money_mode_enabled
  END,
  money_mode_threshold = CASE
    WHEN jsonb_typeof(capabilities->'money_mode_threshold') = 'number'
      THEN (capabilities->>'money_mode_threshold')::integer
    ELSE money_mode_threshold
  END,
  money_mode_hold_until = CASE
    WHEN jsonb_typeof(capabilities->'money_mode_hold_until') = 'string'
      THEN public.try_parse_timestamptz(capabilities->>'money_mode_hold_until')
    WHEN jsonb_typeof(capabilities->'money_mode_hold_until') = 'null'
      THEN NULL
    ELSE money_mode_hold_until
  END,
  money_mode_hysteresis = CASE
    WHEN jsonb_typeof(capabilities->'money_mode_hysteresis') = 'number'
      THEN (capabilities->>'money_mode_hysteresis')::integer
    ELSE money_mode_hysteresis
  END;

-- Keep compatibility mirror in capabilities while columns remain source-of-truth.
CREATE OR REPLACE FUNCTION public.sync_receptionist_money_mode_capabilities()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.capabilities := jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          COALESCE(NEW.capabilities, '{}'::jsonb),
          '{money_mode_enabled}',
          to_jsonb(COALESCE(NEW.money_mode_enabled, false)),
          true
        ),
        '{money_mode_threshold}',
        to_jsonb(COALESCE(NEW.money_mode_threshold, 7)),
        true
      ),
      '{money_mode_hold_until}',
      COALESCE(to_jsonb(NEW.money_mode_hold_until), 'null'::jsonb),
      true
    ),
    '{money_mode_hysteresis}',
    to_jsonb(COALESCE(NEW.money_mode_hysteresis, 2)),
    true
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_receptionist_money_mode_capabilities ON public.receptionists;

CREATE TRIGGER trg_sync_receptionist_money_mode_capabilities
BEFORE INSERT OR UPDATE OF
  money_mode_enabled,
  money_mode_threshold,
  money_mode_hold_until,
  money_mode_hysteresis,
  capabilities
ON public.receptionists
FOR EACH ROW
EXECUTE FUNCTION public.sync_receptionist_money_mode_capabilities();

-- Ensure existing records have compatibility mirror hydrated from source-of-truth columns.
UPDATE public.receptionists
SET capabilities = capabilities;
