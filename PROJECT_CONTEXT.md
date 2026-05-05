# PROJECT_CONTEXT.md — Rutex Frontdesk
> **Source of Truth** for any agent (Lovable, Codex, Claude, etc.) continuing work on this codebase.
> Last regenerated: 2026-05-05. Owner: Lead Software Architect handover.

---

## 1. PLATFORM GOAL

**Rutex Frontdesk** is a multi-tenant **AI Business Operator** (white-label "AI Receptionist") SaaS. A small/medium business owner onboards in minutes; the platform spins up an embeddable **chat + voice widget** that can:

1. **Convert visitors into revenue** — book appointments, take product orders, capture leads, answer FAQs, recover abandoned carts.
2. **Operate the business unattended 24/7** across web widget, SMS, WhatsApp (omnichannel adapters live in `_shared/channels/`).
3. **Self-improve** via the Knowledge-Base Optimizer + Quality Review loop.

Equal-access SaaS: **no pricing tiers**. Every authenticated owner gets every capability. Differentiation is operational quality, not feature gating. (See `mem://platform/equal-access-saas-model`.)

---

## 2. HOW EACH FEATURE SERVES THE GOAL

| Feature | Code Location | Contribution to Goal |
|---|---|---|
| Onboarding Wizard (6 steps) | `src/pages/onboarding/Step1..Step6` + `src/store/onboarding.ts` | Captures business identity → auto-derives `capabilities` JSONB + `primary_goal` (`auto_detect_capabilities` / `auto_detect_primary_goal` SQL fns). Drives the entire AI persona. |
| Receptionist Builder | `src/pages/Builder.tsx` + `generate-system-prompt`, `generate-knowledge-base` edge fns | Owner edits Main Goal / KB / capabilities. Auto-regenerates 7-layer modular prompt. Sandbox preview is **isolated** from production sessions (`mem://features/builder-preview-isolation-v1`). |
| Embedded Widget | `public/widget-embed.js` + `src/components/Widget.tsx` + `src/components/widget/*` | Customer-facing chat. Floating embed snippet is independent (no React on host page). |
| Unified Engine v2 | `supabase/functions/_shared/engine/` | The brain. 9-step deterministic pipeline (Clean → Intent → Entities → State → Requirements → UI Hints → Governor → Prompt Block → Illegal-State Check). Drives revenue conversion. |
| Booking flow | `book-appointment`, `check-availability`, `generate-slots`, `_shared/bookingValidator.ts` | Atomic appointment creation with buffers, daily caps, 5 alternative slots on conflict (`mem://booking/advanced-validation-and-scheduling-rules`). |
| Ordering + Inventory | `create_widget_order` RPC + `deduct_stock` RPC + `_shared/inventoryValidator.ts` | Row-locked atomic stock deduction. Soft-confirmation step before collecting delivery details. |
| Voice | `voice-to-text`, `text-to-speech`, `ai-phone-call` + `VoiceChatOverlay.tsx` | Full-duplex conversational orb. Deepgram/AssemblyAI (STT), ElevenLabs (TTS). |
| Reminders | `appointment-reminder-runner`, `setup-reminder-cron`, `send-reminder` | `pg_cron` 24h/1h jobs with deduplication. |
| Anonymous Mgmt | `confirm-appointment`, `cancel-appointment` + `get_appointment_by_token` RPC | Token-based customer self-service (no auth required). |
| Quality / Optimizer | `optimizer`, `kb-rewrite`, `QualityReview.tsx`, `RealtimeLogs.tsx`, `Diagnostics.tsx` | Continuous improvement loop — flags low-confidence answers for owner review. |
| Multi-tenant Org Layer | `organizations`, `organization_members`, `user_roles`, `has_org_role` SQL fn | RBAC + agency white-labeling. |
| Analytics | `analytics`, `analytics-export` + `Analytics.tsx`, `MoneyMode.tsx` | Revenue-attribution funnel + drop-off tracking. |

---

## 3. ARCHITECTURE — KEY PATTERNS

### 3.1 Unified Engine v2 (THE core; do not bypass)
**Single entry**: `supabase/functions/_shared/engine/core.ts → runEngine(input)`.
**Single state object**: `EngineState` in `engine/types.ts`. Persisted as JSON inside `conversation_state.slots.engineState`. Loaded/saved via `loadState` / `saveState` helpers.
**Pipeline (9 steps) MUST stay in order**:
`createEmptyState` → `cleanInput` → `detectIntent` → `extractEntities` → `updateState` → `checkRequirements` → `generateUIHints` → `generateInstruction` → `buildPromptBlock` → `checkIllegalState`.

**Rule**: `widget-chat/index.ts` is the ONLY function permitted to call `runEngine`. Other edge functions (book-appointment, optimizer, etc.) must NOT replicate intent/entity logic.

### 3.2 7-Layer Modular Prompt
`_shared/layers/prompt-builder.ts` composes layer1-identity → layer7-failure. The Engine's `prompt_block` is injected as a high-priority section. **Do not refactor layers into a single string.** Each layer is independently testable.

### 3.3 Body-based Action Routing
Edge functions use `{ action: "..." }` in the request body to multiplex multiple operations through a single function (works around Supabase Edge Function URL limits). See `appointment-action`, `analytics`. Pattern: `switch (body.action)` at the top of `serve()`.

### 3.4 Channel Abstraction
`_shared/channels/` exposes a uniform `ChannelAdapter` interface. `widgetAdapter.ts` is production-grade; `smsAdapter.ts` and `whatsappAdapter.ts` are scaffolded but **PARTIAL** (Twilio + Meta integrations not fully wired — see §6).

### 3.5 Capability-Based Operator Model
Business behavior is driven by `receptionists.capabilities` JSONB (sells_products, books_appointments, delivers, requires_compliance, supports_emergency) + `primary_goal` enum. Auto-derived by `auto_detect_capabilities(business_type)` SQL fn during onboarding, then editable. The Engine reads these to gate which `task_type` the AI is allowed to start.

### 3.6 Defensive Programming (Stability Mode)
Every edge function:
- Wraps handler in top-level `try { ... } catch (e) { return 200 with error payload }` — **never throw 5xx to widget** (`mem://architecture/stability-mode-and-defensive-programming`).
- Uses `_shared/circuitBreaker.ts` (3 fails / 60s) on outbound LLM/3rd-party calls.
- Uses `_shared/rateLimiter.ts` on widget-facing endpoints.
- Returns `corsHeaders` on every response including errors.

### 3.7 Security Model
- Strict RLS on all 35 public tables. **Never** `USING (true)`.
- Public widget reads use `SECURITY DEFINER` RPCs (`get_public_receptionist`, `get_safe_receptionist_for_widget`, `get_services_for_receptionist`) that whitelist non-sensitive columns.
- `public_catalog` view shields cost/inventory/internal_notes from public + AI (`mem://security/operational-intelligence-shielding`).
- Widget requests MUST include `x-session-id` header — RLS policies depend on it (`mem://security/rls-session-header-requirement`).
- Anonymous appointment management uses opaque tokens via `get_appointment_by_token(p_token)` RPC.

### 3.8 Auth Loading Pattern
`src/App.tsx` exposes `authLoading` state. **All routing decisions wait for `authLoading === false`** to prevent flashing the auth page during refresh.

---

## 4. NAMING CONVENTIONS (FOLLOW STRICTLY)

| Domain | Convention | Example |
|---|---|---|
| Edge fns | `kebab-case` action verb-noun | `book-appointment`, `kb-rewrite` |
| Shared modules | `camelCase.ts` | `bookingValidator.ts`, `actionGate.ts` |
| Engine layers | `layerN-name.ts` | `layer3-memory.ts` |
| React pages | `PascalCase.tsx` matching route | `MoneyMode.tsx` |
| Widget components | under `src/components/widget/` PascalCase | `BookingConfirmation.tsx` |
| SQL RPCs | `snake_case` verb_noun | `create_widget_appointment`, `deduct_stock` |
| SECURITY DEFINER helper fns | prefix `has_` / `is_` / `get_` | `has_org_role`, `is_org_member` |
| State enums | lowercase strings | `task_type: 'booking'` |
| Timestamps in DB | `timestamptz` UTC | localized only at React render time |
| Memory keys | `mem://<category>/<kebab-name>` | `mem://ai/unified-engine-v2-architecture` |

---

## 5. CRITICAL DEPENDENCIES

### Frontend (locked versions matter)
- React **18.3.1** + Vite 5 + TypeScript 5
- `@supabase/supabase-js` ^2.75.1 — uses signing-keys auth; `verify_jwt = false` in functions, validate JWTs in code
- `@tanstack/react-query` ^5.83 — all server state
- `react-router-dom` ^6.30 — App.tsx route table
- `zustand` ^5 — onboarding store only (`src/store/onboarding.ts`)
- `react-hook-form` + `zod` ^4 — all forms
- `date-fns` ^3 — date math; **never use moment**
- `tailwindcss` ^3.4 + shadcn/ui — semantic tokens only (HSL in `index.css`)
- `recharts` ^2.15 — Analytics + MoneyMode charts
- `lucide-react` — icons (floating-blue aesthetic, `mem://style/floating-icons-aesthetic`)

### Backend / Edge
- Deno runtime (Supabase Edge Functions)
- Lovable AI Gateway (preferred) via `LOVABLE_API_KEY` — models: `google/gemini-2.5-flash` (default), `google/gemini-2.5-pro`, `openai/gpt-5-mini`
- Direct providers (fallback): OpenAI, Resend (email), ElevenLabs (TTS), Deepgram + AssemblyAI (STT)
- Postgres extensions: `pgcrypto`, `uuid-ossp`, `pg_cron`, `pg_net`

### Secrets currently set
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SUPABASE_PUBLISHABLE_KEY`, `LOVABLE_API_KEY`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `ELEVENLABS_API_KEY`, `DEEPGRAM_API_KEY`, `ASSEMBLYAI_API_KEY`.

---

## 6. FEATURE STATE MATRIX

| Feature | Status | Notes |
|---|---|---|
| Auth (email + Google OAuth) | ✅ Done | `src/pages/Auth.tsx` |
| Onboarding wizard (6 steps) | ✅ Done | Step1–Step6 all wired |
| Receptionist Builder + sandbox preview | ✅ Done | Isolated state |
| Widget chat (web) | ✅ Done | Engine v2 in production |
| Booking + buffers + alternatives | ✅ Done | `bookingValidator.ts` |
| Inventory deduction (atomic) | ✅ Done | `deduct_stock` RPC with `FOR UPDATE` lock |
| Orders + soft confirmation | ✅ Done | `create_widget_order` RPC |
| Anonymous confirm/cancel | ✅ Done | Token-based |
| Reminders 24h / 1h cron | ✅ Done | Owner must invoke `setup-reminder-cron` once after migration to register jobs |
| Voice chat overlay | ✅ Done | Full-duplex orb |
| Analytics + Money Mode | ✅ Done | Revenue funnel attribution |
| Quality Review + KB Optimizer | ✅ Done | Flags low-confidence answers |
| Multi-tenant orgs + RBAC | ✅ Done | `has_org_role` |
| Transactional emails (Resend) | ✅ Done | `send-booking-confirmation`, `send-booking-email` |
| **WhatsApp adapter** | 🟡 Partial | `whatsappAdapter.ts` + `whatsapp-webhook` scaffolded; Meta credentials/encrypted secrets not wired per-tenant |
| **SMS adapter (Twilio)** | 🟡 Partial | `smsAdapter.ts` scaffold only |
| **Google Calendar sync** | 🟡 Partial | `google-calendar-sync` is minimal skeleton (`mem://delivery/google-calendar-sync-skeleton`) |
| **A/B testing** | 🟡 Partial | Tables + `_shared/abTesting.ts` exist; no UI to author variants |
| **System Health UI** | 🟡 Partial | `system-health` fn returns 0–100 score; surfaced in `Diagnostics.tsx` but not alerted |
| Stripe / Paddle billing | ❌ Not started | Equal-access model — intentional |
| Per-tenant custom domains for widget | ❌ Not started | |

---

## 7. RECENTLY IMPLEMENTED LOGIC — DO NOT REGRESS

These are the load-bearing behaviors most likely to be broken by a careless edit. Read before touching adjacent code.

### 7.1 Conversational Collection Engine
**Where**: `engine/governor.ts → generateInstruction()` + `engine/state.ts → checkRequirements()`.
**Rule**: AI may only ask for **ONE missing field at a time** (`next_required`). It must **never** dump a form. Do not "optimize" by combining questions — this kills conversion (`mem://ai/governor-enforcement-rules`).

### 7.2 Greeting Suppression
**Where**: `engine/intent.ts` + `engine/state.rules.greeted`.
**Rule**: Greetings (`Hi! How can I help…`) are emitted **only on the first message** (`is_first_message: true`). Subsequent turns must skip greeting (`mem://ai/greeting-suppression-policy`). Test: send 3 messages, only message 1 may contain a greeting.

### 7.3 Empathy Non-Repetition
**Where**: `engine/empathy.ts → analyzeEmotionalContext` + `state.rules`.
**Rule**: Max **one** sympathy statement per session (`mem://ai/empathy-non-repetition-rule`).

### 7.4 Hallucination Guard
**Where**: `_shared/hallucinationGuard.ts`.
**Rule**: AI must never invent service names, prices, hours, addresses. If unknown → fixed fallback phrase ("I don't have that info handy — let me note it for the owner."). Grounded only against `services`, `receptionist_faqs`, `availability_rules` for that receptionist.

### 7.5 Action Permission Gate
**Where**: `_shared/actionGate.ts` (Engine v2 Requirement Checker).
**Rule**: AI cannot invoke booking/order RPCs until `requirements.complete === true`. The gate strictly blocks tool use even if the LLM hallucinates a confirmation (`mem://ai/action-permission-gate-validation`).

### 7.6 Name Validator
**Where**: `_shared/nameValidator.ts`.
**Rule**: Rejects "I'm sorry", "yes", verbs, single chars. Strict — do not loosen (`mem://ai/entity-extraction-strictness-policy`).

### 7.7 Atomic Stock Deduction
**Where**: `deduct_stock(p_product_id, p_quantity)` SQL fn.
**Rule**: Uses `SELECT … FOR UPDATE` row lock then conditional update. Returns `{success, available}`. **Never** replace with a non-locking UPDATE — race conditions will oversell.

### 7.8 Booking Idempotency
**Where**: `create_widget_appointment` RPC + `appointments.idempotency_key`.
**Rule**: If `p_idempotency_key` matches existing row, return existing tokens. The widget MUST send a stable key per booking attempt to prevent double-booking on retry (`_shared/idempotency.ts`).

### 7.9 Body-routed Edge Functions
**Where**: `appointment-action`, `analytics`.
**Rule**: All actions multiplex via `body.action`. Do not split into separate edge functions — Supabase has function-count limits and cold-start cost.

### 7.10 Build-fix in `generate-system-prompt`
**Recently fixed**: ~30 lines of orphan code removed after the function closure. The file ends at the `serve(async (req) => { … })` closing `});`. **Do not paste new logic outside the `serve` handler.**

### 7.11 Auth Loading Gate
**Where**: `src/App.tsx`.
**Rule**: `authLoading` blocks all `<Routes>` rendering until Supabase has resolved the session. Removing this re-introduces an auth-page flash bug previously fixed (`mem://architecture/auth-loading-state-pattern`).

### 7.12 RLS Session Header
**Rule**: Frontend Supabase calls from the **widget** must set `global.headers['x-session-id']`. RLS policies on `chat_messages`, `conversation_state`, `conversation_summaries`, `appointment_logs` rely on it for session partitioning. Do not remove from `client.ts`-equivalent widget setup.

---

## 8. DATABASE SNAPSHOT

- **35 tables** in `public` (see `supabase_full_export.sql` in `/mnt/documents/`).
- **24 functions**, all `SECURITY DEFINER` with `SET search_path TO 'public'`.
- **RLS** enabled on all 34 user-data tables. ~106 policies.
- **0 triggers in `public` schema** (per current introspection — `handle_updated_at` and others exist as functions but are not currently bound; verify before relying on auto-timestamps in new tables).
- **1 auth trigger**: `on_auth_user_created` → `handle_new_user()` inserts a row into `public.profiles`.
- **Cron jobs** (via `pg_cron`): registered by `setup-reminder-cron` edge fn — `appointment-reminders-24h`, `appointment-reminders-1h`. Re-run that fn after any DB restore.
- **Views**: `public_catalog`, `widget_receptionists` (+1 more) — used by widget for safe public reads.
- **Full SQL export**: `/mnt/documents/supabase_full_export.sql` (82 KB, 379 statements). Run as `postgres` superuser on a fresh project to recreate.

---

## 9. KNOWN BUGS / OPEN ISSUES

| # | Issue | Location | Severity |
|---|---|---|---|
| B1 | `public` schema currently shows **0 triggers**; updated-at columns may not auto-bump on some tables. Audit `services`, `orders`, `appointments` before relying on `updated_at`. | DB | Medium |
| B2 | WhatsApp inbound webhook signature verification is stubbed | `whatsapp-webhook/index.ts` | High (security) before going live |
| B3 | SMS adapter has no opt-out (STOP) handler | `_shared/channels/smsAdapter.ts` | High before going live |
| B4 | Google Calendar sync is one-way (push only); no event-update or delete propagation | `google-calendar-sync` | Medium |
| B5 | `cleanup_old_*` functions exist but no cron is registered for them | DB | Low (data growth) |
| B6 | `kb-rewrite` can occasionally regenerate KB with stale `services` snapshot if invoked during onboarding step 2 | `kb-rewrite/index.ts` | Low |
| B7 | Voice overlay can stall if browser denies mic mid-session — no recovery toast | `VoiceChatOverlay.tsx` | Low |
| B8 | Per-tenant currency works, but Analytics aggregations sum across currencies as if uniform | `analytics/index.ts` | Medium |

---

## 10. AGENT OPERATING RULES (for Codex / next AI)

1. **Read this file first**, then `mem://index.md`. Do not edit files until you have read both.
2. **Never modify**: `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`, `.env`, `supabase/config.toml` project-level keys, files under `supabase/migrations/`.
3. **Database changes**: only via new timestamped migration files. Always include RLS. Never `USING (true)`.
4. **Edge functions**: must include CORS, top-level try/catch, return 200 even on error, validate input with Zod.
5. **Engine logic**: changes to intent/entities/state/governor MUST come with an updated unit-test scenario in mind. The 9-step pipeline order is sacred.
6. **UI**: only semantic Tailwind tokens. No raw `text-white` / `bg-black`. Floating-blue + glassmorphism aesthetic.
7. **AI calls**: prefer Lovable AI Gateway (`LOVABLE_API_KEY`). Default model `google/gemini-2.5-flash`. Use `gemini-2.5-pro` only for the prompt-builder / KB-rewrite.
8. **Branding**: name is **Rutex Frontdesk**. Never call backend "Supabase" in user-facing copy — use "Lovable Cloud" / "backend".
9. **When stuck**: run `system-health` edge fn for a 0–100 score and component breakdown before guessing.
10. **Verification before handoff**: at minimum, ensure the project builds (typecheck runs automatically), and exercise the changed edge function via `supabase--curl_edge_functions`.

---

## 11. ENTRY POINTS QUICK REFERENCE

- Frontend root: `src/main.tsx` → `src/App.tsx`
- Public landing: `src/pages/Landing.tsx`
- Owner dashboard: `src/pages/Dashboard.tsx`
- Receptionist editor: `src/pages/Builder.tsx`
- Embeddable widget (host snippet): `public/widget-embed.js`
- Widget React shell: `src/components/Widget.tsx`
- AI brain (entry): `supabase/functions/widget-chat/index.ts` → `_shared/engine/core.ts`
- System prompt builder: `supabase/functions/_shared/layers/prompt-builder.ts`
- Booking RPC entry: `supabase/functions/book-appointment/index.ts`
- DB export for replication: `/mnt/documents/supabase_full_export.sql`

---

*End of source-of-truth document. Update this file (do not duplicate it) when architecture changes.*
