# Rutex security hardening status

Last reviewed: 2026-10-17. This is a change-tracking and rollout document, not evidence that production has been remediated.

## Current state

The live Supabase project was inspected read-only. The findings below identify risky permissions or missing caller checks in the inspected code/schema; they are not evidence of exploitation. All remediation PRs listed here are drafts until explicitly reviewed and merged. No production migrations or Edge Function deployments were performed as part of this audit.

| Area | Finding | Proposed fix | State |
|---|---|---|---|
| Safe metadata views | Three views had client mutation grants despite being intended as safe/read-only views | PR #54 revokes client DML and preserves SELECT | Draft; CI previously passed |
| Privileged SQL RPCs | Cleanup routines and stock deduction were executable by client roles; rollback function lacked an explicit owner check | PR #56 tightens grants, rejects invalid stock quantities, scopes rollback to owner, and fixes search paths | Draft; focused PostgreSQL CI passed |
| Background workers | plan-worker, appointment-reminder-runner, and director-sweep used service-role access without an application-level scheduler secret | PR #63 adds a shared internal secret, Vault-backed cron migration, and rollout guide | Draft; focused Deno CI passed |
| Internal email/reminder endpoints | Several service-role email/reminder endpoints were callable without internal authentication | PR #63 guards reminder setup, booking email endpoints, and the superseded reminder runner; updates internal callers | Draft; focused Deno CI passed |
| Operator planning/approval | Request user_id was trusted as identity; async paths could queue work before ownership validation | PR #64 verifies bearer JWT identity, checks ownership before queueing, and scopes version approval | Draft; focused Deno CI passed |
| Appointment actions | Appointment mutations only checked an action token if one was supplied; reminder endpoint did not verify the owner | PR #65 requires owner JWT or action-specific token and owner auth for reminders | Draft; focused Deno CI passed |
| Director voice | Voice endpoint could invoke the private gateway and use the single-owner vault key without caller authentication | PR #66 authenticates and restricts access to the current vault owner | Draft; focused Deno CI passed |
| Notifications | Authenticated caller could override notification recipient user_id and select another receptionist | PR #67 binds notification target to verified caller and owned receptionist | Draft; initial CI failure found and test fixture corrected; latest run pending |

## Deployment blocker: migration history drift

The production migration ledger was observed to lag the repository, with 29 later migration filenames not represented in the live ledger. That comparison does not prove those migrations were never applied; some schema changes already exist live. Do not run a blind supabase db push, bulk-mark migrations as applied, or deploy functions that depend on unverified schema.

Use the evidence-based reconciliation procedure in docs/PRODUCTION_MIGRATION_DRIFT.md. Reconcile each migration against the actual schema, policies, grants, functions, triggers, and scheduled jobs before applying anything.

## Coordinated rollout order

1. Review focused CI and inspect each PR diff. Do not merge merely because CI passes.
2. Reconcile production migration history and validate schema changes in staging.
3. For PR #63, generate a random secret with at least 32 bytes of entropy. Configure the exact same value as Edge Function secret RUTEX_INTERNAL_CRON_SECRET and Vault secret rutex_internal_cron_secret. Never put it in source control, logs, tickets, or chat.
4. Apply the Vault-backed cron migration in staging and verify the three schedules read the header from Vault at runtime.
5. Deploy the updated owner-approval caller from PR #64 before deploying the guards from PR #63. Then deploy PR #63's guarded functions and updated booking caller together. This avoids an approval flow sending no recognized internal secret to the guarded reminder setup endpoint.
6. Apply the database security migrations only after staging verification and migration-history reconciliation.
7. Verify legitimate owner flows and scheduled jobs, and confirm missing/invalid credentials fail closed. Do not call the rollout complete until both positive and negative tests pass.

## Separation of responsibilities

- Director/browser/device task execution (director_tasks / director_commands) remains separate from general AI Worker tasks (ai_worker_tasks).
- A draft worker specification is not an execution runtime. Do not enable worker task execution until durable lifecycle transitions, ownership checks, approvals, bounded tool execution, and outcome verification are implemented and tested.
- Keep customer-facing public widget endpoints separate from privileged service-role background functions.
