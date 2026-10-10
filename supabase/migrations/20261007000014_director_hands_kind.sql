-- Director ledger: record brain-driven hand executions.
--
-- director_commands executions (in-app cursor runs ordered by the
-- gateway agent, later companion runs) land here with kind 'hands':
-- what the brain did through hands, with the command id and receipts.

ALTER TABLE public.director_actions
  DROP CONSTRAINT director_actions_kind_check;

ALTER TABLE public.director_actions
  ADD CONSTRAINT director_actions_kind_check
  CHECK (kind IN ('bookkeeping', 'operator_draft', 'job_retry', 'report', 'hands'));
