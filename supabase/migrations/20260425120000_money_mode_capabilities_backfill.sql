-- Backfill legacy receptionist capability rows with money mode contract keys.
-- Ensures consistent behavior for frontend + widget-chat edge runtime.

update public.receptionists
set capabilities = jsonb_set(
  jsonb_set(
    coalesce(capabilities, '{}'::jsonb),
    '{money_mode_enabled}',
    to_jsonb(
      case
        when jsonb_typeof(coalesce(capabilities, '{}'::jsonb)->'money_mode_enabled') = 'boolean'
          then (capabilities->>'money_mode_enabled')::boolean
        else (ai_mode = 'sales')
      end
    ),
    true
  ),
  '{money_mode_threshold}',
  to_jsonb(
    case
      when jsonb_typeof(coalesce(capabilities, '{}'::jsonb)->'money_mode_threshold') = 'number'
        then least(10, greatest(1, round((capabilities->>'money_mode_threshold')::numeric)::int))
      else 7
    end
  ),
  true
)
where capabilities is null
   or not (capabilities ? 'money_mode_enabled')
   or not (capabilities ? 'money_mode_threshold')
   or jsonb_typeof(capabilities->'money_mode_enabled') <> 'boolean'
   or jsonb_typeof(capabilities->'money_mode_threshold') <> 'number';
