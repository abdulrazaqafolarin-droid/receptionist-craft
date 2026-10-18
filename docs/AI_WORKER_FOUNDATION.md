# Rutex AI Worker Foundation

## Status

This document describes the current staged foundation for the general-purpose AI Worker product: durable worker/task records, a dedicated workspace, version-pinned verification/publication for a narrow draft-only subset, and a restricted Gemini-backed draft executor. It does not claim that the general-purpose capability runtime, integration onboarding, or Director delegation are complete.

## Product boundaries

- **Receptionists** remain customer-facing conversational operators. Their current configuration and runtime stay intact.
- **Director** remains the planner/orchestrator and may build workers, delegate work, use approved capabilities, and verify outcomes.
- **AI Workers** are persistent, general-purpose worker definitions with their own lifecycle and task history.
- **Director browser/device tasks** remain in `director_tasks` until the existing lane is deliberately adapted through a shared execution contract.
- **Receptionist planning jobs** remain in `plan_jobs`; they are not general worker runs.

## First implementation slice

The `worker-registry` Edge Function provides authenticated list/detail, draft create/update/archive, verify/publish/resume and pause actions. It validates worker definitions, derives the actor from a verified bearer token, checks active organization membership, uses optimistic version checks, and only publishes a version that passed the verifier and is supported by the restricted draft-only runner. Lifecycle create/edit/archive writes now use service-role-only SQL RPCs that enforce authorization and append audit events in the same transaction.

Migration `20261016000001_ai_worker_foundation.sql` adds:

### `ai_workers`

A durable worker identity and versioned JSON definition. The definition is expected to grow into a validated contract covering:

- purpose, responsibilities, inputs and outputs;
- capability references and required integrations;
- allowed actions, risk classes and approval policy;
- execution limits, retry/recovery policy and verification criteria;
- workspace presentation/configuration.

The database stores definitions as JSONB. The trusted application validates the contract, and the database independently enforces version-pinned verification, owner/admin publication for shared workers, and the narrow runner allowlist before activation. Only the `draft` action is currently supported; research/internal-read declarations remain unpublished until verified adapters exist.

### `ai_worker_tasks`

A durable task record associated with a worker, including status, input/output payloads, bounded checkpoints, attempts and timestamps. Authenticated clients may read tasks within their permitted scope; task creation and state transitions are intentionally reserved for trusted Edge Functions so a browser cannot mark a task complete or bypass approval by directly editing its status.

## Tenant and access model

- A personal worker has `organization_id IS NULL` and is visible to its creator.
- An organization worker is visible only to members with a completed membership (`joined_at IS NOT NULL`).
- The authenticated client has read access only. Worker creation, definition edits, publishing and lifecycle transitions must go through trusted Edge Functions and service-role-only RPCs so clients cannot bypass validation by setting `status = 'active'`.
- Task visibility is derived from the linked worker's access scope rather than trusting a duplicated organization ID on each task.
- Task rows have no direct authenticated insert/update/delete policies; trusted Edge Functions own task creation and state transitions.

The service layer must still validate that a task's `worker_id` belongs to the same organization scope as the task. RLS is a boundary, not a substitute for validating relationships in trusted code.

## Execution contract principles

1. A plan is not execution. Store the requested goal, plan, task state, action receipts, approvals, and verification evidence separately.
2. A task may only transition through an explicit state machine. In particular, `done` requires evidence, not a model assertion.
3. Unknown external outcomes must not trigger blind duplicate retries for non-idempotent actions.
4. Checkpoints must be bounded and must never contain provider secrets, access tokens, or unredacted credentials.
5. Approval requirements must be enforced by the execution layer, not only by prompt instructions.
6. Every capability must declare its permissions, risk, setup requirements, cost/usage considerations where known, and verification method.
7. Research results are candidates, not proof of safety or readiness. Evaluate license, provenance, maintenance, dependencies, security and deployment requirements before adopting a repository.

## Current UI and runtime boundary

The UI includes a separate AI Workers navigation group, registry page, personal/organization scope selection, and dedicated workspace with definition editing, verification results, publication/pause controls, task creation, output display, and task history. The workspace labels execution as supervised draft-only work and makes clear that no external side effects occur.

The worker registry, task API, verifier, and runner use a persistent database-backed limiter keyed by the Supabase-verified user ID and endpoint scope (30 requests/minute, burst cap 6 per 5 seconds). The bucket table is server-only, the SQL upsert is atomic across Edge Function isolates, and endpoints fail closed with 503 if the limiter RPC is unavailable. Organization-wide, worker-wide and capability-wide budgets are still pending.

## Next implementation stages

**Completed in the repository:** `src/integrations/supabase/types.ts` now includes `ai_workers` and `ai_worker_tasks`, and the worker CI workflow type-checks that file independently of the known repository-wide TypeScript baseline debt.

**Live-schema comparison:** a read-only catalog check confirms that `ai_workers`, `ai_worker_tasks`, and `director_memory` are absent from the live project. The repository type update does not mean the tables are deployed. Reconcile the missing historical migration ledger and validate the complete migration chain in staging before applying anything to production.

1. Complete migration-history reconciliation and validate the worker schema/RLS against staging.
2. Add stale verification-run reconciliation for unexpected Edge Function termination. Draft create/edit/archive, verification start/pass/failure, and publish/pause/resume events are recorded atomically. Add organization-wide, worker-wide and capability-wide budget ceilings.
3. Connect Director planning/building to this lifecycle using durable jobs and checkpoint/resume.
4. Extend execution beyond the verified draft-only runner through registered capability adapters, approval handling, evidence-based completion and resumable checkpoints.
5. Add integration tests for authorization, rate limits, task transitions, approval enforcement, idempotency and recovery.
6. Only after those checks, evaluate deployment targets beyond the initial Rutex-managed runtime.

### Task state safety contract and durable task API

The pure helper `workerTaskState.ts` now specifies and tests allowed transitions before a future trusted runner persists them. It requires an active worker before starting queued work, explicit approval before approved work is re-queued, a resolved blocking condition before resumption, safe retry classification within the attempt budget, and a stopped executor before cancelling in-flight work. A task cannot become `done` without bounded structured evidence. These invariants are enforced by the task API and SQL transition/lease functions; the restricted runner is wired to the task-specific claim, heartbeat and evidence-gated finish RPCs.

### Durable task queue API (new foundation slice)

The `worker-tasks` Edge Function now exposes authenticated `create`, `list`, `get`, `approve`, and `cancel` operations. It verifies the bearer token, checks worker scope and edit permissions, validates the active worker definition before queueing work, and rate-limits requests by verified user ID. Creation requires a client-generated idempotency key; replays with the same payload return the existing task, while key reuse with a different payload is rejected. Task history now uses a stable `(created_at, id)` cursor with bounded page sizes (1–100) and a load-more control; the cursor is opaque and validated before use. Output/event retention and large-evidence redaction policy remain pending.

Migration `20261018000001_ai_worker_task_lifecycle.sql` adds task idempotency, exact approval references, cancellation-request metadata, and a read-only-to-clients `ai_worker_task_events` audit trail. SQL functions create a task plus its creation event atomically and perform approval/cancellation transitions with row locks. Approval only re-queues a task when the supplied approval ID matches the trusted runner's pending approval record. Cancelling a running task records a stop request without falsely marking execution as stopped.

The next migration, 20261018000002_ai_worker_execution_leases.sql, adds execution primitives: atomic skip-locked claims, worker-version-pinned attempts, lease tokens, heartbeats, evidence-gated completion, cooperative cancellation and expired-lease recovery. Expired work is blocked for reconciliation rather than automatically retried because its external side-effect outcome may be unknown. Browser roles cannot read lease tokens or execution internals, and browser/service roles cannot rewrite task audit events.

A first, deliberately narrow executor now exists at worker-runner. It uses direct Gemini generateContent (no tool declarations) for draft-only tasks, validates the declared input/output fields, rejects credential-like values, records a structural verification receipt and never sends messages or performs external writes. It accepts an authenticated user request only when that user can edit the target worker, and it supports an optional task ID to run that exact queued task. The Supabase Edge Function gateway must validate the bearer JWT; the function also checks the user with Supabase Auth and enforces per-user rate limits. It requires the existing Gemini API key. It only accepts tasks whose input_json includes execution_mode=draft and a payload matching the worker's input schema. This endpoint has not been deployed or integration-tested against staging.

**Important runtime boundary:** this is not yet a general-purpose executor. Publication is enabled only for the supervised, no-capability draft subset that passes current-version verification. Research, internal data access, browser/device control, arbitrary code execution and external capability adapters are not executed by worker-runner. Do not manually set a worker to active in production to bypass verification and publication controls.

## Deliberately out of scope for this slice

- Replacing the receptionist engine or renaming existing receptionist pages as workers.
- Arbitrary repository code execution in the production app.
- Customer-controlled deployment agents.
- New microservices or a new database.
- Automatic production migration application or deployment.
