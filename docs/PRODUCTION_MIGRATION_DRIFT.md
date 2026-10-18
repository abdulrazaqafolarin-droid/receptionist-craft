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
| 4 | [PR #56](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/56) | `20261016000002_secure_definer_rpc_access.sql` | Run least-privilege regression tests. This PR also hardens `appointment-action` token/owner authorization and replaces public full-row token lookup with a narrow projection. Public widget order writes must continue through the server-side `widget-chat` path; PR #68 supplies catalog-price validation and must preserve the service-role-only RPC grant. |
| 5 | [PR #63](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/63) | `20261017000001_secure_internal_cron_jobs.sql` | Configure a strong `RUTEX_INTERNAL_CRON_SECRET` in Edge Function secrets and Vault first. Coordinate with PR #64: deploy its caller before guarded functions, and verify scheduler/booking paths in staging. |
| 6 | [PR #68](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/68) | `20261017000002_secure_widget_order_pricing.sql` | Keep the public widget flow callable through `widget-chat`'s service-role path while revoking direct client execution of the RPC. Validate product ownership, catalog price, quantity and idempotency in the function body; preserve `search_path = pg_catalog, public, pg_temp`. |
| 7 | [PR #70](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/70) | `20261017000003_secure_director_task_table_grants.sql` | Remove client table grants (including `TRUNCATE`) from server-managed `director_tasks`; keep service-role access and RLS enabled. Apply only after confirming the live Director access path in staging. |
| 8 | [PR #52](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/52) | `20261018000001` through `20261018000008` (worker lifecycle, leases, verification/publish, audit, rate limits, draft-only gate, stale-run reconciliation, concurrency limits) | Apply after the foundation migration and after the earlier timestamped security migrations. The full chain passes the isolated worker-contract PostgreSQL tests, but staging RLS/organization fixtures and runtime integration still need verification. Never enable the worker UI before all worker migrations are applied. |

### Code-only coordination notes

- [PR #55 — Director request-body parsing](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/55) has the same shared parser and regression test already present on PR #50's Director branch. Treat it as an overlapping patch, not a second independent deployment; verify the combined Director branch keeps the one-shot-body fix.
- [PR #52 — AI Worker runtime](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/52) now includes database-enforced global/user/organization/worker concurrency ceilings, worker-scoped expired-lease recovery, periodic model heartbeats, cooperative cancellation and queued-task retry UI. The code-level tests passed in [AI Worker run #401](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/actions/runs/39157199116), but these changes remain draft and un-deployed.
- [PR #56 — appointment action authorization](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/56) additionally requires either the correct action-specific link token or a verified receptionist-owner session. Its PostgreSQL, Deno and frontend checks passed in [run #188](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/actions/runs/39156434717).

### Mandatory rollout rule

This order is only the proposed order **among these draft files**. It is not a substitute for reconciling the missing historical migration ledger entries listed above. Do not apply this sequence directly to production, do not bulk-mark versions as applied based on object presence, and do not deploy PR #50 code before its schema. First compare the historical migrations to live definitions and stage the complete chain in a disposable/preview database.


### Specific blocker for PR #50: Director memory

The existing migration `20261007000020_director_memory.sql` is part of the historical set missing from the live migration ledger, and the live catalog audit did not find `public.director_memory`. PR #50's long-conversation memory restore must not be deployed until this is resolved. During reconciliation, verify the migration's complete table definition, indexes, RLS policy, grants, and owner-scoped access against staging. If the migration is not safely applicable as written, prepare a corrective migration rather than deploying code that assumes the table exists.


## RPC exposure decisions from the latest live-code audit

- The active browser widget directly uses the public read RPCs `get_public_receptionist` and `get_services_for_receptionist`; retain these public reads and keep their return shapes limited to widget-safe data.
- Widget actions, orders, and conversation persistence are routed through the public `widget-chat` Edge Function. The deployed `widget-chat` database client uses the service-role key first and performs the relevant writes server-side.
- PR #56 therefore restricts direct client execution of `create_widget_order`, `create_widget_appointment`, `deduct_stock`, `insert_booking_suggestion`, `insert_conversion_event`, `upsert_conversation_state`, and `upsert_conversation_summary`, while preserving the server-side service-role path.
- PR #56 now introduces `get_public_appointment_by_token(text)`, which returns only the fields used by the public confirmation/cancellation pages and omits both stored action tokens. It revokes client execution of the legacy full-row `get_appointment_by_token(text)` and updates those two pages to use the safe projection. Apply/reconcile the migration before deploying the updated UI, and verify both confirmation and cancellation flows in staging.


## Follow-up hardening PRs — draft only (18 October 2026)

The read-only findings have now been converted into isolated, tested changes on draft PRs. **None of these changes has been applied to the live database.**

- [PR #54 — safe metadata views](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/54): revokes direct mutation/DDL grants on `companion_devices_safe`, `plan_limits`, and `vault_keys_safe`, preserving the intended read access. Its isolated PostgreSQL privilege regression workflow passed.
- [PR #56 — SECURITY DEFINER and Director task access](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/56): restricts maintenance/write RPC execution, hardens search paths, adds owner checks for config rollback, replaces the public full-row appointment-token lookup with a narrow projection, and revokes unnecessary direct client grants on `director_tasks`. Its isolated PostgreSQL, Deno authorization, frontend build and targeted lint checks passed in [run #188](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/actions/runs/39156434717).
- [PR #68 — widget order integrity](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/68): validates product ownership, catalog price, quantity and idempotency server-side. Its isolated PostgreSQL regression workflow passed.

These passing fixtures are evidence for the specific assertions they exercise, not proof that the complete live schema is equivalent to the fixture. Keep the security and worker PRs in draft until migration-history reconciliation and staging validation are complete. In particular, apply the order-pricing migration and RPC grant hardening as one coordinated release before treating public widget ordering as safe; RPC grant revocation alone does not validate server-side order prices.

- [PR #55 — Director request parsing](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/55): focused Deno check/tests passed; its parser/test are already included in PR #50's branch, so coordinate these overlapping changes.
- [PR #63 — internal cron authentication](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/63): focused Deno checks/tests passed. The secret must be configured in both Edge Function secrets and Vault before the cron migration is applied.
- [PR #64 — operator plan owner authentication](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/64): focused auth tests/typecheck passed; its authenticated scheduler caller depends on the same internal cron secret.
- [PR #70 — Director task table grants](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/70): isolated PostgreSQL grant regression passed; direct client table access remains prohibited.
- [PR #52 — AI Worker runtime](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/52): [run #401](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/actions/runs/39157199116) passed the worker contract, Deno tests, PostgreSQL concurrency/recovery tests, frontend build and lint.


## Re-check and cross-PR rollout gate (18 October 2026)

A second read-only check on 18 October confirms the production migration ledger still ends at `20260826000012`. No migration history, schema, data, or deployed function was changed during this check.

### Current live-state evidence

- `public.director_tasks` and `public.director_commands` are present.
- `public.director_tasks` still has `device_id`, but no `pending_command`. Its observed columns are `id`, `user_id`, `goal`, `lane`, `device_id`, `budget`, `history`, `status`, `result`, `created_at`, and `updated_at`.
- `public.director_memory`, `public.ai_workers`, `public.ai_worker_tasks`, and the newer worker lifecycle/rate-limit tables checked in this pass were not found in the live `public` catalog.
- The production catalog still shows client-role EXECUTE privileges on the security-definer functions targeted by draft PR #56. The new restrictions are repository changes only until their migration is safely rolled out.
- The new safe appointment-token RPC is not present in the live database yet. Do not deploy the updated confirmation/cancellation pages ahead of the migration that creates it.

This confirms the previous release blocker remains active. Object-presence checks are still not enough to repair the migration ledger; the 29 earlier migration files need full definition-by-definition comparison.

### Pending draft changes that affect rollout planning

The following are separate draft changes, not recorded as applied production migrations:

| Change | Dependency / rollout constraint |
|---|---|
| PR #50 — Director task-loop hardening | The branch code requires `director_tasks.pending_command`; apply and verify its matching migration before deploying that Edge Function. |
| PR #54 — safe-view least-privilege | Reconcile the base migration history first; test view SELECT and DML behavior with anon/authenticated roles before production rollout. |
| PR #52 — AI Worker foundation and subsequent lifecycle/runtime migrations | The live database lacks the worker base tables and newer worker lifecycle/rate-limit tables. Validate the complete ordered migration chain on staging; do not apply only the latest migration. |
| PR #56 — security-definer RPC access | Depends on the existing receptionist, appointment, organization, cron and Director objects matching the inspected definitions. The public appointment lookup RPC is currently absent, so the migration creates it. Deploy the database change before the updated public appointment pages. |
| PR #68 — canonical widget order pricing | Must preserve PR #56's server-only `create_widget_order` execution boundary and hardened `search_path`. Verify its migration order and run both pricing and RPC-ACL regression suites together. |

### Required release sequence

1. **Freeze the baseline:** capture a fresh backup, export the current migration ledger, record deployed Edge Function versions, and retain the read-only catalog snapshots.
2. **Finish the original 29-migration comparison:** classify each migration as verified-equivalent, partially applied/drifted, or absent. Compare complete definitions, grants, RLS policies, triggers, indexes, constraints, backfills, and cron jobs—not just object names.
3. **Reconcile in a disposable/staging environment:** test migration repair and genuine reconciliation migrations from the actual recorded baseline. Preserve a reproducible report of every version marked applied and the evidence supporting it.
4. **Apply dependent schema changes before dependent code:** coordinate the Director pending-command column with its Edge Function; create the worker schema before worker APIs/UI rely on it; create the safe appointment-token RPC before deploying the updated pages.
5. **Test cross-PR interactions:** run PR #54 view-grant tests, PR #56 security-definer/RPC tests, PR #68 catalog-pricing tests, and the AI Worker migration/RLS/concurrency suite against the same staging branch. Confirm service-role paths still work and client roles cannot bypass them.
6. **Run end-to-end staging checks:** owner/member/viewer authorization, public appointment confirmation and cancellation links, widget checkout with tampered prices/quantities and cross-tenant IDs, Director task claim/continuation, and worker task lease/recovery.
7. **Request explicit production rollout approval** only after all staging evidence is green. Apply reviewed migrations in dependency order, verify deployed Edge Function versions, then run smoke tests. No automatic bulk migration repair.

### Current decision

**Production rollout remains blocked.** The latest isolated tests improve confidence in the individual draft changes, but neither the old migration-history discrepancy nor the missing worker schema has been reconciled against production. Do not run `supabase db push`, bulk-mark migrations applied, or deploy dependent Edge Functions/pages as a workaround.
