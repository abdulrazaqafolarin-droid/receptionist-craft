# PROJECT_CONTEXT.md — Rutex Frontdesk (AI Receptionist Platform)

> **Source of Truth** for any AI agent (Codex, Claude, Cursor, Lovable) continuing this project.
> Last updated: 2026-04-22. Read this file fully before touching code.

---

## 1. Platform Goal

Rutex Frontdesk is a **multi-tenant SaaS AI Receptionist** that lets any business (services, retail, hybrid) deploy a 24/7 conversational agent that:

1. **Answers questions** from a business-specific knowledge base.
2. **Books appointments** (with availability, buffers, timezones, calendar sync).
3. **Sells products** (with stock, cart, soft-confirm, checkout).
4. **Captures leads** with owner-defined customer fields.
5. **Reminds & confirms** via email + (WhatsApp/SMS adapters).
6. **Optimizes itself** via KB rewrite loop, A/B tests, and quality scoring.

**North star:** every business owner gets an agent indistinguishable from a great human receptionist, with full control of behavior, data fields, currency, timezone, and tone — without writing code.

### How features map to the goal

| Feature                              | Contribution                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| Onboarding Wizard (6 steps)          | Zero-to-live receptionist in <10 min                                          |
| Builder page                         | Owner control surface for identity, KB, customer fields, capabilities         |
| Widget (`/widget/:id` + embed.js)    | Customer-facing channel deployable on any site                                |
| `widget-chat` edge function          | The brain: routes message → engine → AI → tools → response                    |
| Unified Engine v2 (`_shared/engine`) | Single source of truth for intent, entities, state, governor, personality    |
| 7-Layer Prompt (`_shared/layers`)    | Composable system prompt: identity → memory → KB → intent → booking → safety |
| Booking validator + slot generator   | Conflict-free, buffer-aware, timezone-correct scheduling                      |
| Inventory/cost modules               | Real product commerce, not just leads                                         |
| Conversion events + analytics        | Owner sees revenue attribution & funnel                                       |
| KB rewrite loop                      | Closed-loop self-improvement from real conversations                          |
| Reminder cron (24h/1h)               | Reduces no-shows via Resend email                                             |
| Channels adapter                     | Same engine powers Web / WhatsApp / SMS / phone                               |

---

## 2. Tech Stack & Critical Dependencies

* **Frontend:** React 18 + Vite 5 + TypeScript 5 + Tailwind v3 + shadcn/ui + framer-motion
* **State/data:** `@tanstack/react-query`, Zustand (`src/store/onboarding.ts`)
* **Backend:** Lovable Cloud (Supabase). Supabase project ref `mlbsgkkkvaiggxkbtewi`
* **Edge runtime:** Deno (Supabase Edge Functions)
* **AI:** Lovable AI Gateway (`LOVABLE_API_KEY`). Default model `google/gemini-2.5-flash`
* **Email:** Resend (`RESEND_API_KEY`)
* **Voice:** ElevenLabs TTS, AssemblyAI/Deepgram STT
* **Cron:** `pg_cron` + `pg_net` (24h/1h reminders)
* **Markdown rendering:** must use `react-markdown` for AI replies

**Never edit:** `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`, `.env`, `supabase/migrations/*` (only add new migrations).

---

## 3. Architectural Patterns (Established — DO NOT BREAK)

### 3.1 Unified AI Engine v2 — single brain
Location: `supabase/functions/_shared/engine/`
* `core.ts` — `runEngine({ message, session_id, ... })` is the **single entry point**. Returns `{ state, prompt_block, ui_hints }`.
* `intent.ts` — only intent detector. Don't add a second one.
* `entities.ts` — only entity extractor. Includes `cleanInput` normalization (the "Input Cleaner").
* `state.ts` — `EngineState` is the only state object persisted per session.
* `governor.ts` — pre-LLM validation, generates UI hints + injected instructions, blocks illegal transitions.
* `personality.ts` / `empathy.ts` / `responseQuality.ts` / `toneAdapter.ts` — Phase 2 quality enhancers.

**Rule:** any new AI capability extends one of these modules — do NOT introduce a parallel engine.

### 3.2 7-Layer Modular Prompt
Location: `supabase/functions/_shared/layers/` + `prompt-builder.ts`
Composition order is fixed: Identity → Memory → KB → Intent → Booking → Safety → Failure-Prevention → Final Directive. Each layer is independent and testable. Compose with `buildMasterSystemPrompt(config)`.

### 3.3 Channel Abstraction
`_shared/channels/` exports `widgetAdapter`, `whatsappAdapter`, `smsAdapter` over a common `ChannelMessage` shape. New channels = new adapter, never new engine.

### 3.4 Capability Graph (not industry templates)
`receptionists.capabilities` (JSONB) + `primary_goal` drive flows. Defaults auto-detected via `auto_detect_capabilities(business_type)` RPC. Once owner edits, `hasManuallySetCapabilities` flag protects from auto-overwrite.

### 3.5 Owner-defined Customer Fields
`receptionists.customer_fields` JSONB array `[{key,label,type,required,order}]`. The AI's "Conversational Collection Engine" iterates these fields naturally — no hardcoded name/email/phone in collection logic. Builder page has a Customer Information panel for editing.

### 3.6 Anonymous Token Access
Customers act on appointments without auth via signed `confirmation_token` / `cancellation_token`. RPCs: `get_appointment_by_token`, `appointment-action` edge fn. Public widget reads via `widget_receptionists` view (whitelisted columns only) + `get_safe_receptionist_for_widget` RPC.

### 3.7 Session-isolated RLS
Widget passes `x-session-id` header. RLS policies on `chat_messages`, `appointments`, `orders` use `current_setting('request.headers')::json ->> 'x-session-id'` to scope anon access. **Always send the header from the widget**.

### 3.8 Edge Function Body Routing
`supabase.functions.invoke` only supports one body. Multi-op functions (analytics, kb-rewrite) dispatch on `body.action`.

### 3.9 Stability Mode / Defensive Programming
All engine calls wrapped in try/catch with safe fallbacks. Circuit breakers in `_shared/circuitBreaker.ts`. Rate limiter in `_shared/rateLimiter.ts` (30 msg/min per session). Hallucination guard prevents inventing prices/hours.

### 3.10 Auth Loading Pattern
Every protected page uses `authLoading` state — never redirect to `/auth` while loading. Pattern in `src/App.tsx` and pages.

---

## 4. Naming Conventions

* **Edge functions:** kebab-case folders (`widget-chat`, `book-appointment`).
* **Shared modules:** camelCase files (`bookingValidator.ts`, `nameValidator.ts`).
* **React components:** PascalCase (`ProductSelectorEnhanced.tsx`).
* **Tables:** snake_case plural (`receptionists`, `chat_messages`).
* **RPCs:** snake_case verb-first (`create_widget_appointment`, `insert_conversion_event`).
* **Columns:** snake_case; tokens end in `_token`; timestamps end in `_at` or `_timestamptz`.
* **Enums:** suffix `_status`, `_tone`, `_mode`, `_role`, `user_plan`.
* **Design tokens:** HSL semantic in `index.css` + `tailwind.config.ts`. **Never** hardcode colors in components.

---

## 5. Database (35 tables, 6 enums, 24 functions, 106 RLS policies)

A complete migration export lives at `/mnt/documents/supabase_full_export.sql` (verified via libpg_query). Key tables:

* `receptionists` — central tenant config (capabilities, customer_fields, currency, timezone, tone, KB, system_prompt).
* `services` — products/services (`is_product` flag, stock, buffers).
* `service_inventory`, `service_costs`, `service_scheduling_rules` — extended commerce data, shielded from public view.
* `appointments` (+ `appointment_logs`, `appointment_slots`) — booking core.
* `availability_rules` + `availability_exceptions` — schedule source.
* `orders` + `order_items` — commerce fulfillment.
* `chat_messages` — verbatim history (last 30 used for memory).
* `conversation_state` / `conversation_summaries` — engine state + rolling memory summary.
* `conversion_events` + `revenue_attribution` view — funnel.
* `organizations` / `organization_members` / `organization_locations` — agency multi-tenant.
* `user_roles` (separate table — never store roles on profiles).
* Public views: `widget_receptionists`, `public_catalog`, `revenue_attribution`.
* RLS hardening: anonymous SELECT denied on `receptionists`, `profiles`, `ai_responses`, `analytics_cache`, `kb_rewrite_log`, `integrations`, `ai_response_reviews`. Public reads go through views/RPCs.

---

## 6. Critical Recently-Implemented Logic — DO NOT BREAK

### 6.1 Conversational Collection Engine
The AI must iterate `receptionists.customer_fields` order, asking ONE field at a time, naturally, without re-asking captured fields. Lives inside Layer 5 booking + engine state slots. **No hardcoding** of name/email/phone.

### 6.2 Strict Name Validator (`_shared/nameValidator.ts`)
Rejects greetings, pronouns, sentences, profanity. History-aware — won't re-extract a name already captured.

### 6.3 Greeting Suppression
After the first turn, AI must NEVER re-greet ("Hi", "Hello", "Welcome"). Enforced by Layer 6 + governor. The widget sends `displayedGreeting` once on init and persists it via `widget-chat` with `message: ""`.

### 6.4 Empathy Non-Repetition
"I'm sorry to hear that" allowed at most once per session. Tracked in engine state.

### 6.5 Hallucination Guard
Any factual claim (price, hours, address, stock) must come from grounded KB/RPC output. If absent, AI must say it doesn't know and offer to take a message.

### 6.6 Action Permission Gate
Booking/order/cancel tools blocked unless required slots filled AND user explicitly confirmed. Soft-confirm UX for orders.

### 6.7 Auto Calendar Trigger
Explicit booking phrases ("I want to book") auto-open calendar UI via `uiHints.show_calendar`. Quick-action buttons mirror typed intents.

### 6.8 24h Session Restoration
Widget restores full chat on reopen if last_message < 24h. Greeting NOT re-sent.

### 6.9 Reminder Cron
`pg_cron` jobs hit `appointment-reminder-runner` every 15 min, dispatch 24h+1h windows via Resend. After fresh DB restore, owner must re-invoke `setup-reminder-cron` to recreate jobs (cron rows aren't in the export).

### 6.10 Just-fixed Build Error
`supabase/functions/generate-system-prompt/index.ts` had ~30 lines of orphaned duplicate code after the function close. Removed in this session — file now ends at line 139 with `});`. **Don't reintroduce.**

---

## 7. Frontend Routes (`src/App.tsx`)

Public: `/`, `/auth`, `/widget/:id`, `/manage/:token`, `/confirm/:token`, `/cancel/:token`.
Authed: `/dashboard`, `/builder`, `/services`, `/availability`, `/calendar`, `/appointments`, `/orders`, `/conversations`, `/analytics`, `/notifications`, `/settings`, `/organization`, `/channels`, `/faqs`, `/kb-rewrite`, `/quality-review`, `/realtime-logs`, `/diagnostics`, `/widget-install`, `/help`, `/onboarding`, `/onboarding-wizard`.

---

## 8. Secrets to recreate on migration

`LOVABLE_API_KEY` (or `OPENAI_API_KEY`), `RESEND_API_KEY`, `ELEVENLABS_API_KEY`, `ASSEMBLYAI_API_KEY`, `DEEPGRAM_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` (auto), `GOOGLE_CALENDAR_CLIENT_ID/SECRET` (if enabled).

---

## 9. Feature Status

### ✅ Done & Stable
Onboarding wizard, Builder, Widget chat (text+voice), Booking flow, Order flow, Inventory, Cost mgmt, Customer fields config, 7-layer prompt, Engine v2, Channel adapters (web), Reminder cron, KB rewrite, Analytics + revenue attribution, Multi-org, RLS hardening, Token-based public actions, Timezone-aware scheduling, Multi-currency, SEO metadata, Floating-icons aesthetic, Migration export SQL.

### 🟡 Partial
* WhatsApp/SMS adapters: code present, need provider creds + webhook wiring.
* Google Calendar sync: skeleton edge fn only.
* Phone (`ai-phone-call`): scaffold; needs telephony provider.
* A/B testing tables exist; UI for creating tests is minimal.
* Quality review page exists; auto-flagging thresholds need tuning.

### ⛔ Pending / Not Started
* Stripe/Paddle billing for SaaS plans.
* Public marketplace of receptionist templates.
* Native mobile app.
* In-app team chat / handoff to human.

### 🐞 Known / Watch
* If `displayedGreeting` is sent twice (race), greeting may be persisted twice — `greetingSentRef` in `Widget.tsx` guards against this.
* Cron jobs not included in SQL export — must re-run `setup-reminder-cron`.
* `cleanup_old_*` functions exist but aren't scheduled by default — owner can wire via cron.
* Edge function `parse-services` depends on Lovable AI rate limits during onboarding bulk parse.

---

## 10. Verification Performed This Session

1. ✅ Re-read engine, layers, prompt-builder, Widget.tsx, types.ts.
2. ✅ Detected build error in `generate-system-prompt/index.ts` (orphan code after function close).
3. ✅ Fixed by truncating to line 139 + closing `});`. Verified tail of file.
4. ✅ Confirmed file structure matches description (29 edge functions, 31 pages, 35 tables).
5. ✅ Cross-checked SQL export at `/mnt/documents/supabase_full_export.sql` exists.
6. ✅ Wrote this PROJECT_CONTEXT.md as a self-contained handover.

---

## 11. Recommendations for Next Agent

1. Always run `runEngine` — never bypass it with ad-hoc prompts.
2. Add new business behavior via **capabilities + customer_fields**, not hardcoded branches.
3. New channels = new adapter in `_shared/channels/`. Engine stays untouched.
4. New AI rules = extend the relevant Layer file; update `prompt-builder.ts` only if adding a new layer.
5. Schema changes → new migration file, never edit existing ones; types regenerate automatically.
6. Before saying "fixed", verify with build output / edge function logs.
7. Read `mem://` memory index for fine-grained behavioral rules already agreed with the owner.
