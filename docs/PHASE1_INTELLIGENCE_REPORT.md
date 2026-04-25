# Phase 1 Deep Codebase Intelligence Report (Revised)

Date: 2026-04-24 (UTC)

## Scope + constraints actually observed
- `supabase/functions/widget-chat/index.ts` exists and is 2,715 lines.
- `supabase/migrations/` contains 49 migration files.
- `supabase_full_export.sql` is **not present** in this repo snapshot (despite being referenced in prompt/handover docs).
- `supabase/config.toml` in-repo currently only contains `project_id = "mlbsgkkkvaiggxkbtewi"`, which conflicts with AGENTS handover claiming the active project is `esvrhnlwquunsdduvbnr`.

---

## SECTION 1: DATA FLOW MAPS

### 2A — Customer Message Flow (most critical)

1) **Widget UI -> edge invocation**
- `src/pages/Widget.tsx` invokes `widget-chat` on send and on initial greeting storage.
  - `supabase.functions.invoke("widget-chat", ...)` appears in multiple send paths.

2) **Edge intake + protection**
- `widget-chat` receives payload in `serve(async (req) => ...)`.
- Required field validation for `receptionistId` + `sessionId`.
- Abuse checks run before AI pipeline.
- Missing `GEMINI_API_KEY` returns safe fallback.

3) **State + context hydration**
- Reads receptionist record from `receptionists`.
- Loads persisted session via `StateManager.load(...)` from `conversation_state`.
- Reads existing `chat_messages` for first-message logic and history.
- If empty message, stores greeting to `chat_messages`, sets `greeting_sent`, saves state, and exits.

4) **Pipeline orchestration (per non-empty message)**
- Safety classification branch can early-return with safe assistant reply.
- Loads active `services` and splits service vs product with `is_product`.
- Runs `runEngine(...)` (Engine v2).
- Serializes engine state into `conversationState.slots.engineState`.
- Runs slot extraction + flow routing + machine transitions + action gate + governor compatibility sync.
- Builds a composite prompt (7-layer + quality/empathy/tone additions).

5) **AI call**
- Gemini direct fetch to:
  - `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=...`
- Wrapped by circuit breaker via `callAIWithCircuitBreaker`.
- Gemini response normalized to OpenAI-ish `choices[0].message.content` shape for downstream compatibility.

6) **Post-processing and writes**
- Writes user message to `chat_messages`.
- Writes assistant reply to `chat_messages`.
- Writes analytics transcript row to `conversations`.
- Writes quality row to `ai_responses`.
- Conditional auto-actions:
  - booking call -> internal `fetch(.../functions/v1/book-appointment)`.
  - order creation -> inventory validator + `orders` insert path + notification.
- Writes conversion events to `conversion_events` (`booking_completed`, `order_completed`, `lead_captured`).
- Persists updated `conversation_state` and optionally `conversation_summaries`.

7) **Response back to widget**
- Returns: `reply`, booking/order payloads, UI hints, engine+state debug hints.

---

### 2B — Booking Creation Flow

`Customer confirms booking` ->
1. Confirmation inferred from assistant text regex and/or `flow_step==='confirm'`.
2. `checkBookingGate(...)` validates required booking slots.
3. On pass, widget-chat calls `book-appointment` edge function with service/time/customer payload.
4. `book-appointment` persists appointment-domain writes (`appointments`, `appointment_logs`, `notifications`, and slot interactions).
5. widget-chat marks `conversationState.booking_confirmed = true`, transitions machine to completed, and saves state.
6. Conversion log added in `conversion_events` with mode metadata.
7. API response returns `bookingDetails`, enabling widget confirmation render.

Notification + confirmation side-paths present:
- `appointment-action`, `confirm-appointment`, `cancel-appointment`, `send-booking-confirmation`, `send-booking-email`.

---

### 2C — Money Mode Activation Flow

Current implementation is manual:
1. Dashboard component `RevenueEngine` updates `receptionists.ai_mode` (`support|booking|sales`).
2. widget-chat reads mode each turn: `const aiMode = receptionist.ai_mode || 'booking';`.
3. Prompt construction injects mode-sensitive behavior.
4. `conversion_events.metadata.ai_mode` captures mode at event time.

Not implemented yet:
- Per-message buyer-readiness score,
- Threshold-triggered auto activation,
- Hysteresis/cooldown state model.

---

### 2D — Owner Dashboard Data Flow

1. `Dashboard.tsx` loads authenticated user and `receptionists`.
2. Stats counters use count queries over `conversations`, `appointments`, `orders` scoped to receptionist IDs.
3. `DashboardCharts.tsx` fetches last-30-day rows from `conversations`, `appointments`, `orders` and computes buckets/funnel client-side.
4. `RevenueEngine.tsx` loads last-30-day `conversion_events` and computes bookings/leads/orders/revenue.
5. Realtime subscriptions for dashboard modules were **not found** in inspected files.

---

## SECTION 2: INCONSISTENCIES FOUND

### 3A — Dead Code & Orphaned Imports
1. **Unused duplicate UI component**
- `src/components/widget/ProductSelector.tsx` appears unreferenced while `ProductSelectorEnhanced` is used.
- Severity: Medium.

2. **Potentially orphaned edge functions from internal code references**
- Not directly invoked from app code paths: `activate-reminders`, `google-calendar-sync`, `optimizer`, `send-booking-confirmation`, `setup-reminder-cron`, `whatsapp-webhook`.
- Caveat: some can be externally triggered (cron/webhook/manual).
- Severity: Low/Medium (operational discoverability risk).

### 3B — State System Conflicts (critical)
widget-chat concurrently uses:
- `ConversationState` (`StateManager`)
- `EngineState`
- `ActiveTask`
- `GovernorState`
- `MachineContext`

Observed overlap/conflict patterns:
- Engine declared primary, but legacy governor/machine/task remain live in prompt+UI control.
- Confirmation lock is mirrored across multiple systems (`conversationState.*confirmed`, `engineState.rules.confirmation_sent`, `governorState.conversation_rules.confirmation_sent`, machine completed transition).
- UI hints merged from engine + state-machine hints, allowing contradictory display flags.

Authoritative source-of-truth per session currently appears to be **`conversation_state` row** with embedded sub-states (`slots.engineState`, `slots.machineContext`, `active_task`, `governor_state`) rather than a single internal state model.

### 3C — AI Gateway Inconsistencies
- Legacy Lovable gateway remains in `supabase/functions/chat/index.ts`:
  - `LOVABLE_API_KEY`
  - `ai.gateway.lovable.dev`
- Gemini direct is used in:
  - `widget-chat`
  - `generate-system-prompt`
  - `generate-knowledge-base`
  - `parse-services`
  - `kb-rewrite`
- Status: partial migration (not fully homogeneous).

### 3D — Type Safety Issues
- Lint run reports widespread type debt (explicit `any`) and parser/rule failures, including in edge critical path files.
- This increases bug likelihood in slot parsing, action gating, and analytics metadata handling.

### 3E — Error Handling Gaps
- `widget-chat` catches critical errors and still returns HTTP 200 fallback, which can obscure operational failures.
- Several non-fatal catches log only and continue (potential partial-write or hidden failure modes).
- Booking/order side-effects do not use durable retry/outbox semantics.

### 3F — Booking & Order Logic Bugs
1. **Confirmation loops / re-execution risk**
- Booking auto-action condition allows action on response regex OR `flow_step==='confirm'` and can re-attempt when state is stale.

2. **Repeated questions risk**
- Missing-field bookkeeping happens in multiple systems (engine/governor/task/flow), enabling re-asks.

3. **Product vs service ambiguity**
- The model uses `is_product`, but fallback heuristics and mixed catalog assumptions remain in some flows.

4. **Duplicate selector debt**
- `ProductSelector` + `ProductSelectorEnhanced` coexist.

5. **Flow switching mid-task instability**
- flowRouter and machine transitions can diverge; lock semantics not truly centralized.

### 3G — RLS Policy Completeness
- Migration parse indicates RLS-enabled tables do have policy coverage patterns.
- No table found with RLS enabled and missing all CRUD policy declarations.
- Caveat: this validates presence, not correctness/strictness of each policy condition.

### 3H — Deployment Blockers (widget-chat)
1. **Remote imports in entry file**
- `https://deno.land/std@0.168.0/http/server.ts`
- `https://esm.sh/@supabase/supabase-js@2.39.3`
- Plus `import "https://deno.land/x/xhr@0.1.0/mod.ts"`

2. **`--no-remote` incompatibility**
- Any deployment path enforcing no-remote runtime blocks these imports unless fully bundled/vendored.

3. **Dependency tree footprint**
- Local import graph from widget-chat spans 22 local modules under `_shared` + widget-chat.
- No circular local dependency detected in static import traversal.

---

## SECTION 3: INTELLIGENCE NOT IN DOCUMENTATION

### 4A — Hidden Business Rules
- Many hard-coded behavior constraints are embedded in large prompt text blocks (single confirmation, future-date validation, stock behavior, post-confirmation closure rules).
- Regexes on assistant output are used to trigger transactional actions (business side-effects coupled to generated phrasing).

### 4B — Configuration Complexity
- `receptionists` contains broad AI control surface (`ai_mode`, `tone`, `timezone`, `model`, `temperature`, `primary_goal`, `capabilities`, `customer_fields`, `knowledge_base`, `system_prompt`, etc.).
- `capabilities` and `customer_fields` JSONB are semi-structured runtime contracts rather than strict typed schemas.
- AGENTS handover references fields (`money_mode_enabled`, `avg_booking_value`) that do not appear in the in-repo generated type snapshot, signaling schema/version drift risk.

### 4C — Performance & Scale Issues
- widget-chat does many synchronous DB reads/writes on each turn (state/historical context/messages/analytics/conversions/actions).
- Revenue lookup for booking conversion does extra query per event (`services` price lookup by slot service id).
- Dashboard charts/funnel are computed client-side after row fetches rather than server-aggregated analytics.

### 4D — Security Surface
- Edge functions use service-role key (intended for server side) -> high privilege by design; strict auth + input control is mandatory.
- Prompt injection surface exists due to direct interpolation of user content into prompt pipeline.
- No frontend source references to backend secret keys were found in inspected TS/TSX frontend files.

---

## SECTION 4: FEATURE READINESS REPORT

### 5A — Money Mode Intelligence Upgrade
**Exists:**
- Manual mode toggle in dashboard,
- ai_mode read in widget-chat,
- conversion event tagging by ai_mode.

**Missing:**
- Intent score (1–10) per turn,
- Threshold persistence per receptionist,
- Auto-activation + cooldown logic,
- Score telemetry schema and analytics surfaces.

**Complexity:** Medium-high.

---

### 5B — MEO Analytics Dashboard
**Exists:**
- `conversion_events` instrumentation,
- `revenue_attribution` relation in generated types,
- Dashboard/UI components that can host new analytics.

**Missing:**
- Event taxonomy for leak reasons,
- Query layer for “escaped revenue” computation,
- Time-window/cause breakdown UI and remediation recommendations.

**Complexity:** Medium.

---

### 5C — Widget-Chat Bundle Fix
**Exists:**
- Clear import tree and call graph entrypoint.

**Missing:**
- Build/deploy step producing single self-contained edge artifact,
- Automated verification in deployment workflow,
- ASCII sanitization gate (if API path requires it).

**Complexity:** Medium.

---

## SECTION 5: YOUR RECOMMENDED EXECUTION PLAN

1. **Resolve environment truth conflict first**
   - Align repo config + docs to active Supabase project (`esvrhnlwquunsdduvbnr`) and validate all env references.
2. **Fix widget-chat boot reliability**
   - Ship bundled/self-contained deploy artifact compatible with no-remote runtime.
3. **Collapse state authority**
   - Make one state model operationally authoritative (keep compatibility adapters only).
4. **Decouple transaction execution from free-form phrasing**
   - Use explicit structured confirmation state/intent rather than regex over assistant prose.
5. **Complete gateway migration**
   - Remove Lovable gateway remaining calls/secrets from production path.
6. **Raise typing floor in critical path**
   - Prioritize widget-chat + booking/order functions.
7. **Implement Money Mode scoring system**
   - Add per-turn intent scoring, threshold config, and conversion impact tracking.
8. **Build MEO leak analytics**
   - Expand event logging and server-side aggregates for dashboard consumption.

---

**PHASE 1 COMPLETE. Ready to receive AGENTS.md for synthesis.**
