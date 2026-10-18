# Rutex AI Business Operator Platform — Build Roadmap

Last reviewed: 2026-10-18

## Product outcome

Rutex is a business operating platform in which an owner describes an outcome and the **Director** investigates, plans, creates or selects specialist **AI Workers**, coordinates their work, requests approval for consequential actions, verifies results and reports what actually happened. Customer-facing **Receptionists** continue handling inbound conversations, leads, appointments, product orders and follow-up. Each Worker has a durable identity, permissions, workspace, task history and evidence.

The product must optimize for completed, verified business outcomes—not impressive plans, simulated activity or unsupported claims that an action succeeded.

## Non-negotiable architecture boundaries

- **Receptionist runtime:** customer-facing Q&A, lead capture, bookings, orders, customer data, reminders and channel integrations. Keep the existing receptionist engine and operational data model intact.
- **Director:** owner-facing orchestrator. It understands the request, gathers live context, plans, delegates, coordinates workers, tracks dependencies, escalates decisions and verifies final outcomes.
- **AI Workers:** durable specialist definitions and task histories. A generated definition does not automatically become active. Each worker must pass definition validation, capability checks, test runs and publication gates.
- **Director browser/device loop:** director_tasks + director_commands remains the current browser/device execution lane. Preserve atomic claims, resumable checkpoints, receipts and visual verification. Do not silently replace it with general worker tasks.
- **Receptionist configuration planning:** plan_jobs remains for receptionist configuration builds; it is not the general-purpose worker queue.
- **Execution and evidence:** a model response is not proof of an external action. Only trusted adapters, receipts and independent checks support verified completion.
- **Approval:** consequential actions (external writes, messages, publication, purchases, payments, deletion, permission changes and data export) require approval bound to the exact action payload. A payload change invalidates approval.
- **Secrets:** credentials live in the secure integration vault, never in prompts, worker definitions, task inputs/outputs, checkpoints or logs.
- **Deployment:** Rutex-managed execution is the first target. Customer-controlled deployment comes later, after runtime and security boundaries are proven.

## Current repository foundation

The following changes are open draft PRs, not merged or deployed:

- [PR #50 — Director/browser task hardening](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/50): atomic command claims, target checks, resumable command IDs, honest verification outcomes, cursor/task fixes and targeted tests. Live schema lacks pending_command and the live catalog did not show director_memory; rollout is blocked until migration reconciliation and staging validation.
- [PR #52 — AI Worker foundation](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/52): worker definitions, task rows, RLS, registry Edge Function, draft UI, validation contracts and task state policy. This branch now also contains the durable task API and lifecycle migration described below.
- [PR #54 — safe-view least privilege](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/54): remove client mutation privileges from safe metadata views.
- [PR #55 — Director request parsing](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/55): parse the one-shot request body once so gateway-authenticated start/continue requests retain their action.
- [PR #56 — SECURITY DEFINER/RPC hardening](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/56): restrict legacy write RPCs, harden search paths, owner-scope config rollback, narrow public appointment-token projections and restrict direct client grants.
- [PR #68 — widget order pricing/tenant isolation](https://github.com/abdulrazaqafolarin-droid/receptionist-craft/pull/68): derive prices from the active catalog, enforce tenant ownership and quantity bounds, and protect idempotency.

The repository-wide TypeScript/ESLint baseline has existing unrelated failures. Keep focused quality gates green and report baseline debt separately rather than suppressing it.

## Newly added worker-task slice

The current PR #52 branch contains:

- Migration 20261018000001_ai_worker_task_lifecycle.sql: idempotency keys, exact approval references, cancellation-request metadata and an audit-event table.
- Migration 20261018000002_ai_worker_execution_leases.sql: atomic skip-locked claims, worker-version pinning, per-claim lease tokens, heartbeats, evidence-gated completion and expired-lease blocking. Lease internals are not readable by browser roles.
- worker-runner now executes a narrow draft-only task mode through direct Gemini API without tool declarations. It is not deployed; runner secret configuration and staging integration tests remain outstanding.
- Atomic SQL task creation plus a task-created audit event.
- Atomic approval and cancellation transitions. A running task remains running when cancellation is requested until an executor confirms it has stopped.
- worker-tasks Edge Function: authenticated create/list/get/approve/cancel operations, worker-scope checks, definition validation, request bounds, secret-like input rejection and rate limiting.
- Task request tests, SQL lifecycle/RLS tests, generated database types and CI coverage.

**This is a durable queue, not yet an executor.** Worker publication remains disabled. Do not manually set a worker active in production to bypass the missing test-and-verification pipeline.

## Phased build plan

### Phase 0 — Secure, reproducible baseline

- [ ] Review and finalize PRs #50, #52, #54, #55, #56 and #68 independently; avoid merging stacked branches with hidden schema dependencies.
- [ ] Reconcile the Supabase migration ledger with the actual schema. The live ledger stops at 20260826000012 while later objects exist and some expected objects (including director_memory in the earlier audit) are absent. Do not blindly mark migrations applied or run db push.
- [ ] Build a migration evidence matrix: expected object, observed definition, grants, RLS, dependent functions/triggers, data migration/backfill and staging result.
- [ ] Apply migrations to a disposable database from a clean baseline and to staging in dependency order; compare schema and function definitions after each group.
- [ ] Verify each Edge Function's auth path, service-role usage, input limits, rate limit, CORS, error redaction and tenant authorization.
- [ ] Add authenticated-browser smoke tests for Director, receptionist widget, bookings, orders and worker draft workspace.
- [ ] Establish release rollback notes and production smoke-test checklist.

**Exit gate:** clean-baseline migrations pass, staging schema matches expected definitions, no unexplained privilege regressions, and critical customer-facing flows pass.

### Phase 1 — Worker lifecycle and durable task queue

- [x] Versioned worker definition contract and validation.
- [x] Personal/organization access checks and draft-only registry.
- [x] Durable task rows with server-managed writes and a state-transition contract.
- [x] Idempotent task creation and atomic creation audit.
- [x] Approval-ID-bound resume and safe cancellation-request semantics.
- [x] Scoped task history and client-read-only audit grants.
- [ ] Add lifecycle audit records for draft create/edit/archive, verification runs, activation and pause.
- [ ] Add persistent/distributed rate limiting; current in-memory limits reset on Edge Function cold starts.
- [ ] Add task pagination and retention policy for outputs, events and large evidence payloads.
- [ ] Add integration tests for cross-tenant access, concurrent duplicate creation, stale approvals, retries and concurrent cancel/approve races.

**Exit gate:** transitions are atomic, idempotent and scope-checked; task state cannot be changed directly by clients; tests cover concurrent and adversarial cases.

### Phase 2 — Capability catalog and secure integration setup

- [ ] Define a capability manifest: stable key/version, input/output schema, risk, required scopes, secret references, cost limits, timeout, idempotency support, test method and evidence format.
- [ ] Separate discovered, evaluated, configured, verified and enabled integrations. A repository result or README is not proof an integration works.
- [ ] Reuse existing Rutex connectors and APIs before adding new libraries or microservices.
- [ ] Build guided setup: explain permissions, collect credentials through the vault, validate with a read-only probe, show granted access and allow revocation.
- [ ] Create a capability adapter interface with typed inputs/outputs, structured errors, timeout/cancellation, redacted logs and idempotency keys.
- [ ] Start with low-risk, reversible capabilities: bounded web research, internal read-only queries and draft generation.
- [ ] Add isolated sandbox tests and dependency/license/security review before adopting external repositories or CLIs.
- [ ] Explicitly deny arbitrary shell/code execution in the production worker runtime until isolated execution, resource quotas and network policy are proven.

**Exit gate:** each enabled capability has an owner, permissions, test evidence, timeout and failure contract; no capability is enabled solely from model-generated configuration.

### Phase 3 — Worker verification and publication

- [ ] Build a verifier that checks worker contract, capability keys, schemas, action/risk compatibility, approval rules, execution budgets and evidence requirements.
- [ ] Generate bounded test suites from declared success criteria, including negative and permission-denial tests.
- [ ] Run tests with mocked or read-only capabilities in an isolated environment; never send real messages or mutate production data in a test.
- [ ] Store durable verification runs with exact worker version, test inputs, outcomes, evidence, failure classifications and runtime version.
- [ ] Require mandatory tests to pass and an authorized owner/admin to approve publication.
- [ ] Publish immutable worker versions; edits to an active worker create a new draft version and do not silently mutate a running task's contract.
- [ ] Support pause, rollback to a prior version and emergency disable with audit history.
- [ ] Keep publish/activate unavailable until the verifier and version semantics exist.

**Exit gate:** an active worker is pinned to a verified immutable version and capability allowlist; any change requires re-verification.

### Phase 4 — Worker execution runtime

- [x] Add atomic task claiming with lease token, lease expiry, heartbeat and worker-version pinning (database primitives; not yet wired to a runner).
- [x] Add evidence-gated finish, cooperative cancellation and expired-lease blocking rather than blind automatic retries (database primitives).
- [ ] Add concurrency limits per user, organization, worker and capability; add global budget ceilings.
- [ ] Define the execution loop: load task and pinned definition → plan bounded steps → validate each proposed action → check capability and approval policy → execute through adapter → persist receipt/checkpoint → verify postcondition.
- [ ] Persist a checkpoint before and after every external side effect. Do not retry an action with an unknown outcome unless its adapter proves idempotency or verifies whether it already occurred.
- [ ] Enforce queued, running, waiting approval, blocked, failed, done and cancelled states. Every terminal state has a reason and timestamps.
- [ ] Add retry classes: safe transient, permanent, rate-limited, needs user input, approval denied and unknown side-effect outcome. Unknown must stop for reconciliation, not auto-retry.
- [ ] Enforce max steps, timeout, max retries, input/output byte limits, token/cost budgets and capability-specific quotas.
- [ ] Validate outputs against declared schemas and success criteria; require adapter receipts or independent verification for completion claims.
- [ ] Implement cooperative cancellation and lease recovery. Expired leases can be reclaimed only after resolving whether an action was in flight and whether its outcome is known.
- [ ] Add a dead-letter/reconciliation path for stuck tasks and operator-visible diagnostics.

**Exit gate:** chaos tests cover duplicate requests, process restarts, expired leases, network timeouts, unknown external outcomes, approval races, cancellation and stale checkpoints. No task is marked done based only on model prose.

### Phase 5 — Director orchestration

- [ ] Add durable Director runs with goal, plan version, dependencies, worker/task assignments, budgets, checkpoints, approvals, receipts and final verification.
- [ ] Use a plan DAG for independent/serial work; validate dependencies and reject cycles.
- [ ] Let Director research existing code/integrations and compare reuse options before proposing a custom build. Record repository provenance, license, maintenance, dependency and security findings.
- [ ] Let Director create worker drafts and test plans; activation still goes through Phase 3.
- [ ] Delegate only tasks compatible with the worker's declared capabilities and organization permissions.
- [ ] Aggregate results with provenance; resolve conflicts and missing evidence rather than inventing a single answer.
- [ ] Make consequential actions explicit approval cards showing target, payload, risk, expected result and cost. Approval is bound to a hash/version of that payload.
- [ ] Support pause/resume, task reassignment, retry after known-safe failure and escalation to the owner.
- [ ] Verify final business outcomes against external/internal state, not merely child task status.
- [ ] Preserve the existing Director browser/device lane as a specialized capability adapter only after its contracts and migration dependencies are stable.

**Exit gate:** a Director run survives restarts, explains each delegation, stops on unsafe uncertainty, requests the right approval and shows evidence for the final result.

### Phase 6 — Dedicated Worker workspaces

- [ ] Task board with state, owner, worker version, priority, due date, dependencies, attempts and last verified update.
- [ ] Activity timeline with decisions, tool calls, receipts, evidence, approvals, errors and cost/usage.
- [ ] Output/artifact panels with source references and versioned files.
- [ ] Approval inbox with exact pending action and before/after state.
- [ ] Retry/recovery controls that explain whether retry is safe.
- [ ] Worker settings for allowed capabilities, autonomy, limits, notification rules and pause state.
- [ ] Run history and replayable test fixtures that do not re-run live side effects.
- [ ] Accessibility, keyboard operation, reduced-motion support, loading/empty/error states and mobile layout.
- [ ] Keep chat as a supporting interface; structured workspace and task state are the primary product surface.

**Exit gate:** owners can understand what a worker is doing, what it can access, why it is blocked, what needs approval and what evidence supports completion without reading raw logs.

### Phase 7 — Receptionist and revenue operations

- [ ] Keep current receptionist Q&A, leads, booking, orders, inventory, reminders and analytics stable.
- [ ] Finish WhatsApp/SMS/phone/email integrations with consent, template/compliance, retries, delivery receipts and opt-out handling.
- [ ] Complete Google Calendar sync with conflict detection, idempotency, time zones and reconciliation.
- [ ] Validate pricing, inventory, tenant scope and duplicate order prevention server-side; never trust browser-supplied prices.
- [ ] Add reliable revenue attribution tied to confirmed business events.
- [ ] Monitor message delivery, booking conflicts, failed payments, inventory drift and reminder failures.
- [ ] Provide owner-visible escalation and human handoff for low confidence or policy-bound requests.

**Exit gate:** critical receptionist workflows have integration tests, idempotent side effects, observable failure queues and a documented recovery path.

### Phase 8 — SaaS operations and commercial readiness

- [ ] Organization onboarding, roles, invites, member lifecycle and tenant-isolation tests.
- [ ] Persistent quotas and usage accounting by organization, worker, model, capability and channel.
- [ ] Stripe/Paystack billing and plan enforcement at the server boundary; UI-only limits do not count.
- [ ] Usage/cost visibility, audit exports and retention controls.
- [ ] Secret vault rotation, least-privilege connector scopes, audit trail and incident response.
- [ ] Backups, restore drills, database migration rollback strategy, SLOs and alerts.
- [ ] Production deployment automation with staging promotion, smoke tests and rollback.
- [ ] Customer-controlled deployment only after the Rutex-managed runtime is stable and supportable.

**Exit gate:** billing cannot be bypassed by direct API calls; usage is attributable; tenant isolation, recovery and support operations are demonstrated.

### Phase 9 — Release, measurement and continuous improvement

- [ ] Define reliability metrics: evidence-backed task success, approval latency, unsafe-action blocks, duplicate side effects, unknown outcomes, recovery time, cost per verified outcome and receptionist conversion lift.
- [ ] Build representative evaluations for receptionist intent, booking/order correctness, worker planning, permission boundaries and Director final verification.
- [ ] Run regression/eval suites on prompt, model, capability, schema and migration changes.
- [ ] Roll out behind feature flags and organization cohorts; monitor before expanding.
- [ ] Test prompt injection in web pages/files, cross-tenant IDs, approval payload tampering, replayed webhooks and credential leakage.
- [ ] Maintain change logs, known limitations, incident playbooks and explicit rollback instructions.

**Exit gate:** release quality is measured with repeatable evidence and monitored after deployment, not judged by a green build alone.

## Immediate next actions

1. Finish the current PR #52 CI cycle; fix every new task-runtime failure before adding more features.
2. Re-run the isolated PostgreSQL task lifecycle test after each migration edit and inspect exact workflow logs.
3. Verify the task API against authenticated staging only after migration-history reconciliation; no production DDL or deployment during this stage.
4. Add worker lifecycle audit and distributed rate limiting; configure the draft runner secret in staging and exercise it end-to-end.
5. Implement capability adapters and worker verification before enabling activation.
6. Extend the runner only through explicitly registered, typed, risk-classified adapters with approval gates.
7. Integrate Director delegation only after retries, approval gates and evidence pass adversarial tests.
7. Review the independent security PRs and verify their CI, dependencies and live call sites; do not merge a large stacked branch as a substitute for rollout sequencing.

## Release blockers that must remain visible

- Production migration ledger/schema drift is unresolved.
- PRs remain draft and not merged/deployed.
- The worker queue has no general execution runner yet.
- Worker activation/publication is deliberately disabled.
- The new task queue needs staging integration tests, especially concurrent requests and failure recovery.
- Director migration dependencies and authenticated-browser behavior remain unverified in production.
- Existing repository-wide TypeScript/ESLint baseline debt is separate from focused feature gates and must not be concealed.
