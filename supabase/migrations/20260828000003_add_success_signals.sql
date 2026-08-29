-- Step 9 (§5.3): success-signal capture.
-- User-level (pre-receptionist) measurement events that let us check whether the
-- FrontDesk redesign actually helped new owners:
--   (a) conversational-vs-form fork adoption   -> signal 'onboarding_path_chosen' (payload.path)
--   (b) time to a fully configured operator    -> signal 'configured_operator'
--   (c) navigation support-question volume     -> signal 'navigation_help' (payload.section + optional question)
-- Every signal can be attributed to a profile via user_id, so signals captured
-- BEFORE any receptionist exists are still per-owner and not lost.

create table if not exists public.success_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  signal text not null check (signal in (
    'onboarding_path_chosen',
    'configured_operator',
    'navigation_help'
  )),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_success_signals_user on public.success_signals(user_id, created_at);
create index if not exists idx_success_signals_signal on public.success_signals(signal, created_at);

alter table public.success_signals enable row level security;

-- Owners may read and write their own signals.
drop policy if exists "Owners manage their own success signals" on public.success_signals;
create policy "Owners manage their own success signals"
  on public.success_signals
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
