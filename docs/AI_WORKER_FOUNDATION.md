# Rutex AI Worker Foundation

## Status

This document describes the first persistence slice for the general-purpose AI Worker product. It does not claim the worker builder, generic runtime, integration onboarding flow, or dedicated workspace are implemented yet.

## Product boundaries

- **Receptionists** remain customer-facing conversational operators. Their current configuration and runtime stay intact.
- **Director** remains the planner/orchestrator and may build workers, delegate work, use approved capabilities, and verify outcomes.
- **AI Workers** are persistent, general-purpose worker definitions with their own lifecycle and task history.
- **Director browser/device tasks** remain in `director_tasks` until the existing lane is deliberately adapted through a shared execution contract.
- **Receptionist planning jobs** remain in `plan_jobs`; they are not general worker runs.

## First persistence slice

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

## Next implementation stages

1. Generate/update Supabase TypeScript types from the migration and validate the migration against a disposable development database.
2. Add a server-side worker service with organization-scope validation and explicit lifecycle transitions.
3. Implement worker creation from a validated specification; initially support draft/configuration workers before arbitrary code execution.
4. Add a dedicated worker registry and workspace with task queue, task detail, approvals, outputs, history and settings.
5. Connect Director planning/building to this lifecycle using durable jobs and checkpoint/resume.
6. Add tests for personal and organization isolation, role permissions, task transitions, approval enforcement, idempotency and recovery.
7. Only after those checks, evaluate deployment targets beyond the initial Rutex-managed runtime.

## Deliberately out of scope for this slice

- Replacing the receptionist engine or renaming existing receptionist pages as workers.
- Arbitrary repository code execution in the production app.
- Customer-controlled deployment agents.
- New microservices or a new database.
- Automatic production migration application or deployment.
