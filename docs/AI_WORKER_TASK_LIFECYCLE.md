# AI Worker Task Lifecycle Contract

## Scope

This is the pure safety contract for the next AI Worker runtime slice. It does not execute models, tools, browser actions, or business operations. The future runtime must call these guards before committing state changes or invoking a capability.

## Task state transitions

- `queued → running`: a trusted runner has atomically claimed the task.
- `running → waiting_approval`: a proposed action is paused before execution.
- `waiting_approval → queued`: a verified approver authorizes resumption; the runner must resume from its checkpoint and re-check the action.
- `waiting_approval → blocked`: an approver rejects the action.
- `running → done`: only after a separate verification step passes and at least one evidence item is recorded.
- `running → blocked/failed/cancelled`: the runner records a concrete reason.
- `failed/blocked → queued`: only through an explicit retry, within the configured retry budget and when retry safety has been established.
- `done/cancelled` are terminal.

The helper does not authorize a caller, write a database row, claim a task atomically, or store an audit event. Those are responsibilities of the Edge Function and database layer. It must not replace verified identity, RLS, database constraints, or atomic conditional updates.

## Capability policy

- Every action must be present in the worker's validated `allowed_actions`.
- Consequential actions (external writes, messages, publishing, purchases/payments, deletion, permission changes and data export) always require a recorded approval, even if a worker definition omits the action from its approval list.
- Approval must be scoped to the exact proposed action and arguments; it cannot be reused for a materially different action.
- Unknown actions fail closed.
- A model response claiming success is not verification evidence.
- Checkpoints and evidence must not contain API keys, access tokens, or unredacted credentials.

## Remaining before production execution

1. Persist task events and approvals with actor identity and timestamps.
2. Implement atomic leases/claims and idempotency for task creation and tool actions.
3. Connect the runtime to the existing Rutex gateway and a small, explicit capability registry.
4. Add a separate verifier that checks evidence against task success criteria.
5. Add integration tests for concurrent claims, authorization, approval replay, retry safety and recovery.
6. Keep the existing `director_tasks` browser/device loop separate; it is not a generic worker executor.
