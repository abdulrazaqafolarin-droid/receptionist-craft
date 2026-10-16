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
