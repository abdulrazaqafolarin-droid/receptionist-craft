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

## Migration-ledger inventory — read-only snapshot (16 October 2026)

A direct comparison of the repository migration filenames with the live `schema_migrations` ledger found:

- Repository `main`: 95 migration files; latest filename version `20261007000021`.
- Live ledger: latest recorded version `20260826000012`.
- No ledger version was found without a corresponding repository migration file in this comparison.
- **29 repository migrations after the latest ledger version are not recorded in the live ledger.**

This is a filename/ledger comparison, not proof that all 29 migrations were or were not applied manually. The live schema already contains several Director objects, so do not mark these migrations applied merely because a table exists. Compare the full DDL, policies, grants, indexes, functions, triggers and constraints for each migration before classifying it.

| Migration version | File |
|---|---|
| `20260828000001` | `20260828000001_allow_authenticated_read_connector_catalog.sql` |
| `20260828000002` | `20260828000002_add_configurator_reasoning_history.sql` |
| `20260828000003` | `20260828000003_add_success_signals.sql` |
| `20260830000001` | `20260830000001_add_module_action_log.sql` |
| `20260830000002` | `20260830000002_owner_agent_tables.sql` |
| `20260924000001` | `20260924000001_fix_receptionist_org_rls.sql` |
| `20261002000001` | `20261002000001_add_widget_surface_to_public_rpc.sql` |
| `20261006000001` | `20261006000001_plan_jobs_async_planning.sql` |
| `20261006000002` | `20261006000002_plan_job_lanes.sql` |
| `20261007000001` | `20261007000001_internal_operator_support.sql` |
| `20261007000002` | `20261007000002_build_threads.sql` |
| `20261007000003` | `20261007000003_versioned_manual_saves.sql` |
| `20261007000005` | `20261007000005_director_grants.sql` |
| `20261007000006` | `20261007000006_director_threads.sql` |
| `20261007000007` | `20261007000007_director_actions.sql` |
| `20261007000008` | `20261007000008_director_bookkeeping_scope.sql` |
| `20261007000009` | `20261007000009_director_sweep_cron.sql` |
| `20261007000010` | `20261007000010_director_activity.sql` |
| `20261007000011` | `20261007000011_api_key_vault.sql` |
| `20261007000012` | `20261007000012_director_message_metadata.sql` |
| `20261007000013` | `20261007000013_director_commands.sql` |
| `20261007000014` | `20261007000014_director_hands_kind.sql` |
| `20261007000015` | `20261007000015_companion_devices.sql` |
| `20261007000016` | `20261007000016_runner_platform.sql` |
| `20261007000017` | `20261007000017_browser_platform.sql` |
| `20261007000018` | `20261007000018_director_requests.sql` |
| `20261007000019` | `20261007000019_commands_realtime.sql` |
| `20261007000020` | `20261007000020_director_memory.sql` |
| `20261007000021` | `20261007000021_director_tasks.sql` |

### Required reconciliation output

For every row above, record one of: (a) verified already applied exactly, (b) partially applied / schema drift, or (c) not applied. Include evidence for each table, column, index, constraint, policy, grant, function, trigger and scheduled job. Only after this comparison should the team prepare a reconciliation migration or repair the ledger in an isolated environment. Never bulk-mark the 29 migrations as applied and never run `db push` against production while the classification is incomplete.


## First-pass live-object reconciliation matrix (16 October 2026)

This matrix records object-presence evidence from read-only catalog queries. **“Present” is not the same as “migration verified/applied”:** it only means the named object/feature was observed. Exact definitions, grants, trigger bodies, data backfills and dependency order still require migration-by-migration comparison before any ledger repair.

| Migration | Live evidence observed | Preliminary classification | Remaining verification |
|---|---|---|---|
| `20260828000001` connector catalog read policy | `connector_definitions` exists and policy `Authenticated users can view connector catalog` exists for authenticated SELECT | Present, definition not fully compared | Compare policy predicate, grants and table schema to file |
| `20260828000002` reasoning history column | `config_versions.reasoning_notes` exists | Present, definition not fully compared | Compare column type/default/comment and migration order |
| `20260828000003` success signals | Table, both named indexes, RLS and owner policy observed | Present, definition not fully compared | Compare full columns, index predicates and policy expression |
| `20260830000001` module action log | Table, named indexes and three named policies observed | Present, definition not fully compared | Compare columns, unique index and all policy expressions |
| `20260830000002` owner-agent tables | All six tables (`owner_chat_messages`, `owner_proposals`, `config_reasoning_history`, `owner_autonomous_rules`, `owner_insights_log`, `explanation_cache`) and their RLS policies/indexes observed | Present, definition not fully compared | Compare all columns, constraints, grants and policies; verify migration dependency on the prior reasoning-history migration |
| `20260924000001` organization RLS fix | Expected organization-aware receptionist/staff policy names observed | Present, definition not fully compared | Compare each USING/WITH CHECK expression and confirm obsolete policies were removed |
| `20261002000001` widget surface RPC | `get_public_receptionist(uuid)` exists and returns `widget_surface` | Present, definition not fully compared | Compare full SQL body, grants and view/data exposure |
| `20261006000001` async plan jobs | `plan_jobs`, queue/receptionist indexes, RLS policies, `claim_plan_job(text)` and `schedule_plan_worker_cron(text,text)` observed | Present, definition not fully compared | Compare function bodies, scheduler permissions, queue semantics and cron target |
| `20261006000002` plan job lanes | `plan_jobs.lane`, lane constraint/index and `claim_plan_job(p_lane text)` observed | Present, definition not fully compared | Compare defaults, lane ordering/fallback behavior and function ACL |
| `20261007000001` internal operator support | `services.expiry_date` and `receptionists_business_model_check` observed | Present, definition not fully compared | Compare constraint values and column defaults |
| `20261007000002` build threads | `build_threads`, `build_messages`, indexes, trigger and owner RLS policies observed | Present, definition not fully compared | Compare FK definitions, trigger body, grants and policies |
| `20261007000003` versioned manual saves | `revert_config_version(uuid,integer)` and `record_manual_version(uuid,text)` exist | Present, definition not fully compared; security issue tracked | Compare full function definitions and ACLs. The current rollback function lacks an explicit owner check; see [PR #56](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/56) |
| `20261007000005` Director grants | `director_grants`, owner policy and scope constraint observed | Present, definition not fully compared | Compare policy, uniqueness and grants |
| `20261007000006` Director threads | `director_threads`, `director_messages`, indexes, trigger and owner policies observed | Present, definition not fully compared | Compare FKs, trigger body and policies |
| `20261007000007` Director actions | `director_actions`, index, owner policy and status/kind constraints observed | Present, definition not fully compared | Compare full columns, constraint values, policy and grants |
| `20261007000008` bookkeeping scope | `director_grants.scope`, `allowed`, `note` and scope constraint observed | Present, definition not fully compared | Compare the exact ALTER statements and default/backfill behavior |
| `20261007000009` Director sweep schedule | Scheduler function exists; active `director-sweep` cron job is present at `*/15 * * * *` | Present, runtime schedule observed | Compare job command/headers to migration intent; do not print bearer values into audit logs |
| `20261007000010` Director activity | `director_activity`, index and owner read policy observed | Present, definition not fully compared | Compare column/FK definitions and policy |
| `20261007000011` API-key vault | `api_keys`, `vault_audit_logs`, indexes and `vault_keys_safe` view observed; RLS is enabled and the base tables have no policies | Present, definition not fully compared | Compare view definition/owner semantics, effective grants and the intended single-account restriction |
| `20261007000012` Director message metadata | `director_messages.metadata` exists | Present, definition not fully compared | Compare type/default and dependent client code |
| `20261007000013` Director commands | `director_commands`, queue/user indexes, RLS and read/finish policies observed | Present, definition not fully compared | Compare table shape, claim/update policy expressions and grants |
| `20261007000014` Director hands kind | `director_actions.kind` check constraint includes `hands` | Present, definition not fully compared | Compare all allowed values and any related code assumptions |
| `20261007000015` companion devices | `companion_devices`, safe view, user/secret indexes, and `director_commands.device_id` plus its index observed | Present, definition not fully compared | Compare safe-view filtering/semantics, device grants, FKs and RLS |
| `20261007000016` runner platform | `companion_devices_platform_check` includes `runner` | Present, constraint evidence observed | Compare exact platform list and migration precondition behavior |
| `20261007000017` browser platform | `companion_devices_platform_check` includes `browser` as well as `runner` | Present, constraint evidence observed | Compare exact platform list and migration precondition behavior |
| `20261007000018` Director requests | `director_requests`, user/status index, RLS and read/answer policies observed | Present, definition not fully compared | Compare all columns, expiry semantics and policy predicates |
| `20261007000019` commands realtime | `director_commands` is a member of `supabase_realtime` publication | Present, publication evidence observed | Compare publication membership against the exact intended set |
| `20261007000020` Director memory | No `public.director_memory` table was returned by the live catalog query | **Missing or renamed; likely not applied** | Verify no alternate table name/branch-specific replacement exists; inspect function dependencies before deciding whether to apply or repair |
| `20261007000021` Director tasks | `director_tasks`, user index, RLS-enabled table observed; no client policies found | Present, server-only access appears intentional | Compare exact columns/FKs/ACLs. `pending_command` is absent and belongs to the separate PR #50 rollout, not this migration |

### Reconciliation conclusion from this pass

- Twenty-eight migrations have at least one expected object/feature observed, but **none is marked “verified already applied exactly”** from presence-only evidence.
- `20261007000020_director_memory.sql` is the clear missing-object candidate in this pass; confirm there is no alternate/renamed implementation before classifying it as unapplied.
- The active Director sweep cron job and realtime publication membership are runtime state, not proof that the corresponding migration ledger rows were recorded.
- The table/function presence of the other Director migrations suggests manual or out-of-band schema changes may have occurred. Do not mark them applied until full DDL, policy, grants, triggers, indexes and backfills match.
- This is still read-only evidence. No production DDL, data writes, ledger repair or deployment was performed.


## Additional draft migrations created after this audit

The table above audits the migration ledger through `20261007000021`. Later feature/security PRs introduce additional migration files that are **not evidence of production application**. Keep them separate from the 29-version reconciliation list until each PR is reviewed and its rollout approved.

| Order by filename | Draft PR | Migration | Rollout dependency |
|---|---|---|---|
| 1 | [PR #50](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/50) | `20261015000001_director_task_pending_command.sql` | Apply the schema change before deploying Director code that reads/writes `pending_command`. The live table was observed without this column. |
| 2 | [PR #54](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/54) | `20261016000000_secure_safe_view_grants.sql` | Verify legitimate view reads and writes before rollout; keep the safe views read-only for client roles. |
| 3 | [PR #52](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/52) | `20261016000001_ai_worker_foundation.sql` | Verify the full worker schema, RLS and registry Edge Function against staging before enabling the UI. |
| 4 | [PR #56](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/56) | `20261016000002_secure_definer_rpc_access.sql` | Run the least-privilege regression tests. Public widget interactions are routed through `widget-chat`; direct execution of the underlying order-write RPC is restricted to `service_role`. PR #68 adds catalog validation and must preserve that grant boundary. |
| 5 | [PR #63](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/63) | `20261017000001_secure_internal_cron_jobs.sql` | Configure a strong `RUTEX_INTERNAL_CRON_SECRET` in Edge Function secrets and Vault first. Coordinate with PR #64: deploy its caller before guarded functions, and verify scheduler/booking paths in staging. |
| 6 | [PR #68](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/68) | `20261017000002_secure_widget_order_pricing.sql` | Keep the public RPC callable; validate product ownership, catalog price, quantity and idempotency in the function body. Preserve `search_path = pg_catalog, public, pg_temp` when replacing the function. |
| 7 | [PR #70](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/70) | `20261017000003_secure_director_task_table_grants.sql` | Remove client table grants (including `TRUNCATE`) from server-managed `director_tasks`; keep service-role access and RLS enabled. Apply only after confirming the live Director access path in staging. |

### Mandatory rollout rule

This order is only the proposed order **among these draft files**. It is not a substitute for reconciling the missing historical migration ledger entries listed above. Do not apply this sequence directly to production, do not bulk-mark versions as applied based on object presence, and do not deploy PR #50 code before its schema. First compare the historical migrations to live definitions and stage the complete chain in a disposable/preview database.


### Specific blocker for PR #50: Director memory

The existing migration `20261007000020_director_memory.sql` is part of the historical set missing from the live migration ledger, and the live catalog audit did not find `public.director_memory`. PR #50's long-conversation memory restore must not be deployed until this is resolved. During reconciliation, verify the migration's complete table definition, indexes, RLS policy, grants, and owner-scoped access against staging. If the migration is not safely applicable as written, prepare a corrective migration rather than deploying code that assumes the table exists.


## RPC exposure decisions from the latest live-code audit

- The active browser widget directly uses the public read RPCs `get_public_receptionist` and `get_services_for_receptionist`; retain these public reads and keep their return shapes limited to widget-safe data.
- Widget actions, orders, and conversation persistence are routed through the public `widget-chat` Edge Function. The deployed `widget-chat` database client uses the service-role key first and performs the relevant writes server-side.
- PR #56 therefore restricts direct client execution of `create_widget_order`, `create_widget_appointment`, `deduct_stock`, `insert_booking_suggestion`, `insert_conversion_event`, `upsert_conversation_state`, and `upsert_conversation_summary`, while preserving the server-side service-role path.
- PR #56 now introduces `get_public_appointment_by_token(text)`, which returns only the fields used by the public confirmation/cancellation pages and omits both stored action tokens. It revokes client execution of the legacy full-row `get_appointment_by_token(text)` and updates those two pages to use the safe projection. Apply/reconcile the migration before deploying the updated UI, and verify both confirmation and cancellation flows in staging.
