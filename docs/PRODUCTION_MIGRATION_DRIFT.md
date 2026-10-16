# Production schema and migration-history drift

## Status

**Do not run a broad production migration push until this discrepancy has been reconciled.** This note records a read-only inspection of the connected Rutex Supabase project on 16 October 2026. No production schema or migration history was changed.

## Evidence observed

- The recorded `supabase_migrations.schema_migrations` history stopped at `20260826000012` during the inspection.
- The live `public` schema already contained later Director-related tables, including `director_tasks`, `director_commands`, `director_actions`, `director_requests`, `director_threads`, `plan_jobs` and `api_keys`.
- The live `director_commands` table included `device_id`.
- The live `director_tasks` table did **not** include `pending_command`.
- The currently deployed `director-task` Edge Function was version 8 and did not reference `pending_command`.
- The available Supabase branch reported `MIGRATIONS_FAILED`.

These facts do not prove every migration is missing from the schema. They show that the recorded migration ledger and the live schema are not sufficient, by themselves, to establish a safe deployment sequence.

## Immediate deployment rule

Do not deploy the PR #50 Director task-loop change until its `pending_command` migration and Edge Function are treated as one release unit. The deployed version observed during this audit did not require that column; the newer branch code does. Deploying only one side would risk runtime failures.

## Safe reconciliation procedure

1. **Take/verify a current database backup** and record the current deployed Edge Function versions.
2. **Inspect actual schema state** for every migration after the latest recorded version. Compare each migration's intended objects, columns, indexes, constraints, functions, triggers and RLS policies with the live database.
3. **Reconcile migration history deliberately.** If a migration's changes are already present and equivalent, use the supported Supabase migration-repair workflow to mark only that verified version as applied. Do not mark a batch of versions applied just because similarly named tables exist.
4. **Write a reconciliation migration** for genuine schema differences. Prefer guarded, idempotent DDL where appropriate, but do not use `IF NOT EXISTS` as a substitute for comparing definitions.
5. **Validate from a clean disposable database** and an isolated Supabase development branch. Check both fresh-install behavior and upgrade behavior from the actual recorded baseline.
6. **Deploy database changes before dependent Edge Function code** when the new code requires new columns or constraints. Verify the live function version and a real read/write path afterward.
7. **Re-run migration and security checks** before returning the release to production readiness.

## Avoid

- A blind `supabase db push` while the migration ledger and schema disagree.
- Marking migrations as applied without verifying the full intended DDL.
- Applying the AI Worker migration to production before the drift is understood.
- Deploying the PR #50 `pending_command` code without its matching schema change.
- Treating a successful Vite build or isolated SQL test as proof that production deployment is safe.

## Current AI Worker PR

PR #52 validates its new worker migration against an isolated PostgreSQL 17 fixture, including RLS behavior. That is useful evidence for the migration itself, but it does not reconcile the live Rutex Supabase migration history and is not permission to apply the migration to production.

## Additional read-only security-advisor snapshot (16 October 2026)

A read-only Supabase security-advisor check also reported the following. These are **triage findings, not proof that every item is exploitable**.

- Three views were flagged as using SECURITY DEFINER semantics: `public.companion_devices_safe`, `public.plan_limits`, and `public.vault_keys_safe`.
- Four RLS-enabled tables were reported as having no policies: `public.api_keys`, `public.companion_devices`, `public.director_tasks`, and `public.vault_audit_logs`. Confirm their effective grants and intended server-only access model before deciding whether policies are missing.
- The advisor reported functions with mutable search paths and SECURITY DEFINER functions executable by `anon`. Some RPCs may intentionally be public; trigger-only and internal functions should not be assumed to need public execution.

Read-only view-definition inspection found that `companion_devices_safe` filters on `user_id = auth.uid()`; `plan_limits` returns static plan-limit rows; and `vault_keys_safe` filters on both `auth.uid()` and a hard-coded user UUID. The latter may be an unintended restriction and needs comparison with the intended vault access model. Do not infer exploitability or change grants/views from advisor labels alone.

A tracking issue was opened: [#53 — triage live Supabase security-advisor findings](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/issues/53).

### Security-audit acceptance gate

1. Inspect view ownership, PostgreSQL/Supabase view security semantics, underlying table RLS and effective grants.
2. Test anonymous and authenticated access for each view and each table flagged as RLS-enabled without policies.
3. Classify every anon-executable SECURITY DEFINER function as intentionally public, trigger-only, or internal; restrict execution where public access is not required.
4. Set safe function search paths where appropriate.
5. Implement any changes as reviewed migrations and test them on an isolated database first.
6. Re-run security advisors and targeted RLS/RPC tests.
7. Do not apply security changes to production until migration-history drift is reconciled and the rollout is explicitly approved.

A further read-only privilege check confirmed that both `anon` and `authenticated` currently have `SELECT`, `INSERT`, `UPDATE`, and `DELETE` privileges on all three views, and the views have no visible `security_invoker` reloption. This makes the view access model a higher-priority investigation: `companion_devices_safe` and `vault_keys_safe` are simple single-table views, while `plan_limits` uses `UNION ALL` and has different updateability characteristics. Combined with the no-policy findings for underlying tables, this is a **potential access-control risk, not yet a confirmed exploit**. No production write was attempted. Reproduce behavior on an isolated database, test anonymous and cross-user DML, and prepare least-privilege grants/view semantics before any production change.
