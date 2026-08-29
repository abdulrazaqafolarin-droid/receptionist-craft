-- Migration: 20260830000001_add_module_action_log.sql
-- §4.3 Module-Agent Reciprocal Coordination — new in this session.
--
-- WHY: Step 8 gave every agent a shared live snapshot (§4.2) but module agents
-- (email responder, SMS, invoice follow-up, reminders, review management, etc.)
-- never knew what each OTHER recently did with the same customer. That allowed
-- double-touching (email + SMS both reaching out minutes apart) and meant agents
-- were NOT "aware of each other" as §4.3 requires.
--
-- THIS IS THE MECHANISM: a coordination ledger (`module_action_log`) that every
-- module agent WRITES after acting and READS before acting, surfaced to the
-- model through `buildCoordinationPromptBlock()` in
-- `_shared/context/moduleCoordination.ts` (see that file for the contract).
--
-- Design rules:
--  - One row per module action, keyed to a customer (and optionally a thread).
--  - `action_key` gives a stable dedup/coordination key per (module, customer,
--    intent) so agents can detect "already handled" and avoid re-touching.
--  - Every module agent MUST record an action here when it reaches out; the
--    ledger is only as trustworthy as the agents that write to it.
--  - Extensible per §4.3: a new module needs NO new table — it just calls the
--    shared helper to read/write rows in this same ledger.

CREATE TABLE IF NOT EXISTS public.module_action_log (
  id              uuid primary key default gen_random_uuid(),
  receptionist_id uuid not null references public.receptionists(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  module_key      text not null,            -- e.g. email_responder, sms_campaign
  customer_id     uuid,                     -- FK to customers(id) when known
  customer_email  text,                     -- fallback identity when no customer row yet
  customer_phone  text,                     -- fallback identity (SMS/WhatsApp)
  action_type     text not null,            -- sent, drafted, queued, escalated, reminded
  action_key      text not null,            -- stable dedup/coordination key (module+customer+intent)
  target_channel  text,                     -- email | sms | whatsapp | review | invoice | reminder
  detail_json     jsonb default '{}'::jsonb,-- human-interpretable "what was said/done"
  acted_at        timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- Fast lookups: "what did other modules do for this customer lately?"
CREATE INDEX IF NOT EXISTS idx_module_action_log_customer
  ON public.module_action_log (customer_email, acted_at DESC);
CREATE INDEX IF NOT EXISTS idx_module_action_log_customer_id
  ON public.module_action_log (customer_id, acted_at DESC);
-- Dedup check: has this module already handled this exact (customer+intent)?
CREATE UNIQUE INDEX IF NOT EXISTS idx_module_action_log_key
  ON public.module_action_log (receptionist_id, action_key);

-- ── RLS: owners read/write their own business's ledger; service role all ──
ALTER TABLE public.module_action_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'module_action_log_select_owner' AND tablename = 'module_action_log') THEN
    CREATE POLICY module_action_log_select_owner ON public.module_action_log
      FOR SELECT USING (
        receptionist_id in (select id from public.receptionists where user_id = auth.uid())
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'module_action_log_insert_owner' AND tablename = 'module_action_log') THEN
    CREATE POLICY module_action_log_insert_owner ON public.module_action_log
      FOR INSERT WITH CHECK (
        receptionist_id in (select id from public.receptionists where user_id = auth.uid())
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'module_action_log_service_role' AND tablename = 'module_action_log') THEN
    CREATE POLICY module_action_log_service_role ON public.module_action_log
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;
