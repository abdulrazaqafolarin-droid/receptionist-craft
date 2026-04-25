-- Money Mode backlog: dedicated schema columns, workflow controls, and KPI gates.
alter table public.receptionists
  add column if not exists money_mode_enabled boolean not null default false,
  add column if not exists money_mode_auto_activation_enabled boolean not null default true,
  add column if not exists money_mode_threshold integer not null default 7,
  add column if not exists money_mode_hysteresis_band integer not null default 1,
  add column if not exists money_mode_hold_turns integer not null default 2,
  add column if not exists automation_workflows jsonb not null default '{"missed_booking_recovery": true, "after_hours_lead_capture": true, "no_show_reduction": true}'::jsonb,
  add column if not exists kpi_gate_min_conversion_rate numeric not null default 12,
  add column if not exists kpi_gate_min_revenue numeric not null default 1000;

alter table public.receptionists
  drop constraint if exists receptionists_money_mode_threshold_check,
  add constraint receptionists_money_mode_threshold_check check (money_mode_threshold between 1 and 10);

alter table public.receptionists
  drop constraint if exists receptionists_money_mode_hysteresis_band_check,
  add constraint receptionists_money_mode_hysteresis_band_check check (money_mode_hysteresis_band between 0 and 4);

alter table public.receptionists
  drop constraint if exists receptionists_money_mode_hold_turns_check,
  add constraint receptionists_money_mode_hold_turns_check check (money_mode_hold_turns between 0 and 10);

-- Backfill from capabilities so new columns are immediately usable.
update public.receptionists
set
  money_mode_enabled = coalesce((capabilities ->> 'money_mode_enabled')::boolean, money_mode_enabled),
  money_mode_auto_activation_enabled = coalesce((capabilities ->> 'money_mode_auto_activation_enabled')::boolean, money_mode_auto_activation_enabled),
  money_mode_threshold = coalesce((capabilities ->> 'money_mode_threshold')::integer, money_mode_threshold),
  money_mode_hysteresis_band = coalesce((capabilities ->> 'money_mode_hysteresis_band')::integer, money_mode_hysteresis_band),
  money_mode_hold_turns = coalesce((capabilities ->> 'money_mode_hold_turns')::integer, money_mode_hold_turns),
  automation_workflows = coalesce((capabilities -> 'automation_workflows'), automation_workflows),
  kpi_gate_min_conversion_rate = coalesce((capabilities ->> 'kpi_gate_min_conversion_rate')::numeric, kpi_gate_min_conversion_rate),
  kpi_gate_min_revenue = coalesce((capabilities ->> 'kpi_gate_min_revenue')::numeric, kpi_gate_min_revenue);

-- Keep analytics taxonomy explicit for automation workflow counters.
comment on column public.receptionists.automation_workflows is 'Workflow toggles: missed_booking_recovery, after_hours_lead_capture, no_show_reduction';
