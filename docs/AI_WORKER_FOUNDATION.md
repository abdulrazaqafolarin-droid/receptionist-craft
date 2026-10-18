# Rutex AI Worker Foundation

## Status

This document describes the first persistence slice for the general-purpose AI Worker product. It does not claim the worker builder, generic runtime, integration onboarding flow, or dedicated workspace are implemented yet.

## Product boundaries

- **Receptionists** remain customer-facing conversational operators. Their current configuration and runtime stay intact.
- **Director** remains the planner/orchestrator and may build workers, delegate work, use approved capabilities, and verify outcomes.
- **AI Workers** are persistent, general-purpose worker definitions with their own lifecycle and task history.
- **Director browser/device tasks** remain in `director_tasks` until the existing lane is deliberately adapted through a shared execution contract.
- **Receptionist planning jobs** remain in `plan_jobs`; they are not general worker runs.

## First implementation slice

The `worker-registry` Edge Function now provides authenticated `create_draft`, `update_draft`, and `archive` actions. It validates worker definitions, derives the actor from a verified bearer token, checks active organization membership, uses optimistic version checks for draft edits, and deliberately does not expose a publish/activate action before a test-and-verification pipeline exists. Browser reads remain governed by RLS.

Migration `20261016000001_ai_worker_foundation.sql` adds:

### `ai_workers`

A durable worker identity and versioned JSON definition. The definition is expected to grow into a validated contract covering:

- purpose, responsibilities, inputs and outputs;
- capability references and required integrations;
- allowed actions, risk classes and approval policy;
- execution limits, retry/recovery policy and verification criteria;
- workspace presentation/configuration.

The database currently stores the definition as JSONB; schema validation and publishing checks belong in the trusted application/runtime layer before a worker becomes active.

### `ai_worker_tasks`

A durable task record associated with a worker, including status, input/output payloads, bounded checkpoints, attempts and timestamps. Authenticated clients may read tasks within their permitted scope; task creation and state transitions are intentionally reserved for trusted Edge Functions so a browser cannot mark a task complete or bypass approval by directly editing its status.

## Tenant and access model

- A personal worker has `organization_id IS NULL` and is visible to its creator.
- An organization worker is visible only to members with a completed membership (`joined_at IS NOT NULL`).
- The authenticated client has read access only. Worker creation, definition edits, publishing and lifecycle transitions must go through trusted Edge Functions so clients cannot bypass validation by setting `status = 'active'`.
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

The first UI slice now includes a separate AI Workers navigation group, a registry page, personal/organization scope selection, draft creation, and a dedicated worker workspace for editing the draft specification and reviewing its current permissions. The UI explicitly states that workers do not execute tasks yet.

The `worker-registry` Edge Function supports scoped list/detail reads plus draft creation, draft updates and archive. It applies a per-verified-user in-memory rate limit (30 requests/minute, burst cap 6 per 5 seconds) and returns `429` with `Retry-After` when exceeded. This is a first-line guard only: isolate restarts can reset it, so persistent/distributed limiting remains required before higher-volume production use. The registry deliberately has no publish/activate or task-run action.

## Next implementation stages

**Completed in the repository:** `src/integrations/supabase/types.ts` now includes `ai_workers` and `ai_worker_tasks`, and the worker CI workflow type-checks that file independently of the known repository-wide TypeScript baseline debt.

**Live-schema comparison:** a read-only catalog check confirms that `ai_workers`, `ai_worker_tasks`, and `director_memory` are absent from the live project. The repository type update does not mean the tables are deployed. Reconcile the missing historical migration ledger and validate the complete migration chain in staging before applying anything to production.

1. Complete migration-history reconciliation and validate the worker schema/RLS against staging.
2. Add durable lifecycle audit records, persistent/distributed rate limiting (the current in-memory limit is only a first-line guard), and explicit worker-version semantics.
3. Connect Director planning/building to this lifecycle using durable jobs and checkpoint/resume.
4. Implement generic task execution, approval handling, evidence-based completion and resumable checkpoints.
5. Add integration tests for authorization, rate limits, task transitions, approval enforcement, idempotency and recovery.
6. Only after those checks, evaluate deployment targets beyond the initial Rutex-managed runtime.

### Task state safety contract (prerequisite, not an executor)

The pure helper `workerTaskState.ts` now specifies and tests allowed transitions before a future trusted runner persists them. It requires an active worker before starting queued work, explicit approval before approved work is re-queued, a resolved blocking condition before resumption, safe retry classification within the attempt budget, and a stopped executor before cancelling in-flight work. A task cannot become `done` without bounded structured evidence. This helper is not yet wired to a task API or runner; it is the tested contract the next runtime slice must enforce.

### Durable task queue API (new foundation slice)

The `worker-tasks` Edge Function now exposes authenticated `create`, `list`, `get`, `approve`, and `cancel` operations. It verifies the bearer token, checks worker scope and edit permissions, validates the active worker definition before queueing work, and rate-limits requests by verified user ID. Creation requires a client-generated idempotency key; replays with the same payload return the existing task, while key reuse with a different payload is rejected.

Migration `20261018000001_ai_worker_task_lifecycle.sql` adds task idempotency, exact approval references, cancellation-request metadata, and a read-only-to-clients `ai_worker_task_events` audit trail. SQL functions create a task plus its creation event atomically and perform approval/cancellation transitions with row locks. Approval only re-queues a task when the supplied approval ID matches the trusted runner's pending approval record. Cancelling a running task records a stop request without falsely marking execution as stopped.

The next migration, 20261018000002_ai_worker_execution_leases.sql, adds the execution protocol primitives needed by a future trusted runner: atomic skip-locked claims, version-pinned attempts, opaque per-claim lease tokens, heartbeats, evidence-gated finish, cooperative cancellation and expired-lease recovery. Expired work is blocked for reconciliation rather than automatically retried because its external side-effect outcome may be unknown. Browser roles cannot read lease tokens or execution internals, and task audit events are append-only to the service role.

**Important runtime boundary:** this is a durable queue and lifecycle API, not yet an executor. The registry still does not publish/activate workers, so ordinary UI-created drafts cannot run tasks. A trusted runner, capability adapters, durable leases/heartbeats, retry classification, output verification, and an end-to-end approval UI remain required before the platform can truthfully execute and verify general work. Do not manually set a worker to active in production to bypass those missing controls.

## Deliberately out of scope for this slice

- Replacing the receptionist engine or renaming existing receptionist pages as workers.
- Arbitrary repository code execution in the production app.
- Customer-controlled deployment agents.
- New microservices or a new database.
- Automatic production migration application or deployment.
