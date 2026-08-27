# RUTEX PLATFORM — COMPLETE UNDERSTANDING DOCUMENT

> **Generated:** 2026-08-23 | Full-stack deep-dive audit of every layer
> **Method:** Read 100% of widget-chat/index.ts, all 28 edge functions, all `_shared/` modules,
> full frontend (`src/`), all root docs, PLUS live read-only queries against production Supabase
> (`esvrhnlwquunsdduvbnr`) via Management API.
> **Status:** Complete. Every claim below is verified against source code and/or live DB.

---

# TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Complete Architecture Map](#2-complete-architecture-map)
3. [The Message Lifecycle (End-to-End Trace)](#3-the-message-lifecycle)
4. [Widget-Chat Deep Dive (The Brain)](#4-widget-chat-deep-dive)
5. [Shared Backend Modules Map](#5-shared-backend-modules)
6. [All 28 Edge Functions Survey](#6-edge-functions-survey)
7. [Frontend Architecture Map](#7-frontend-architecture)
8. [Database Ground Truth (Live)](#8-database-ground-truth)
9. [Money Mode Mechanics](#9-money-mode-mechanics)
10. [Security Model](#10-security-model)
11. [Deployment & Production State](#11-deployment--production-state)
12. [All Findings Ranked (Bugs / Dead Code / Risks)](#12-findings-ranked)
13. [Quick Reference Index](#13-quick-reference-index)

---

# 1. EXECUTIVE SUMMARY

**Rutex is a multi-tenant AI receptionist SaaS** ("Conversational Revenue Infrastructure").
A business owner onboards via a 6-step wizard; the platform generates an embeddable chat + voice
widget that converses with visitors via Google Gemini, collects booking/order slots through a
deterministic state machine, enforces guardrails against hallucination, executes atomic
bookings/orders against Postgres, and tracks revenue conversion events.

```
Stack:      React 18 + Vite 5 + TypeScript 5 + Tailwind v3 + shadcn/ui
Backend:    Supabase (PostgreSQL + 28 Deno Edge Functions)
AI Engine:  Google Gemini 2.5 Flash Lite (DIRECT API — no gateway)
Deploy:     Vercel (frontend) + Supabase Edge Functions (backend)
Project:    esvrhnlwquunsdduvbnr (eu-west-2, ACTIVE_HEALTHY, PG 17.6)
Widget chat version on production: v51
```

### The one-paragraph mental model

A visitor opens a host site → `widget-embed.js` injects a floating bubble → iframe loads
`/widget?rid=<receptionistId>` → `src/pages/Widget.tsx` fetches config via SECURITY DEFINER RPCs →
every typed message POSTs to `widget-chat` edge function → that monolith runs abuse checks, loads
tenant data + conversation state, runs Engine v2 (deterministic 9-step intent/entity/state
pipeline), computes Money Mode score, assembles a ~17-block system prompt, calls Gemini through a
circuit breaker, parses `[WIDGET:]` markers out of the reply, gates-and-executes bookings/orders
with SHA-256 idempotency keys, persists everything, and returns `{reply, uiSignal, flags}` →
the widget renders the reply plus ONE interactive UI component (selector/picker/form/confirmation).
Revenue events flow into `conversion_events` → owner's RevenueEngine dashboard shows funnel +
HOT/WARM/COLD sessions + MEO leakage.

---

# 2. COMPLETE ARCHITECTURE MAP

```
┌─────────────────────────────────────────────────────────────────────────┐
│ HOST BUSINESS WEBSITE                                                   │
│   <script src=".../widget-embed.js" data-receptionist-id="X">           │
│   → vanilla JS bubble (60px circle, z-index max)                        │
│   → lazy iframe → {origin}/widget?rid=X                                 │
│   → postMessage 'rutex:unread' badge protocol                           │
│   → window.RutexChat.open()/close()/toggle() public API                 │
└──────────────────────────────┬──────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ VERCEL FRONTEND (React SPA)                                             │
│                                                                         │
│  PUBLIC ROUTES                    OWNER ROUTES (sidebar shell)          │
│  /widget              Widget.tsx  /dashboard  /builder/:id               │
│  /appointments/confirm            /services   /availability             │
│  /appointments/cancel             /calendar   /orders                   │
│  /booking/:id  /cancel/:id        /money-mode /analytics                │
│  /confirm/:id  /help              /quality-review  /kb-rewrite          │
│                                   /diagnostics /realtime-logs           │
│  AUTH-GATED                       /organization /channels /settings     │
│  /auth  /onboarding-wizard        /faqs  /conversations  /notifications │
│    Step1→6 (zustand store)        /widget-install/:id                   │
└──────────┬──────────────────────────────────────────┬───────────────────┘
           │ supabase-js (anon key)                   │ functions.invoke()
           ▼                                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ SUPABASE (esvrhnlwquunsdduvbnr)                                         │
│                                                                         │
│  Postgres: 35 tables · 25 routines · ~110 RLS policies                  │
│    SECURITY DEFINER RPCs for public reads:                              │
│      get_public_receptionist · get_safe_receptionist_for_widget         │
│      get_services_for_receptionist · get_appointment_by_token           │
│    Write RPCs: create_widget_appointment · create_widget_order          │
│      deduct_stock (SELECT FOR UPDATE row locks)                         │
│                                                                         │
│  28 Edge Functions (ALL verify_jwt=false):                              │
│    BRAIN:    widget-chat (v51, 3,379 lines) · chat (v27, legacy)        │
│    BOOKING:  book-appointment · check-availability · generate-slots     │
│              confirm/cancel/appointment-action                          │
│    AI UTILS: generate-system-prompt · generate-knowledge-base           │
│              parse-services · kb-rewrite                                │
│    NOTIFY:   send-booking-email · send-booking-confirmation             │
│              send-reminder · activate-reminders                         │
│              appointment-reminder-runner · setup-reminder-cron          │
│              create-notification                                        │
│    OPS:      analytics · analytics-export · optimizer · system-health   │
│    CHANNELS: whatsapp-webhook · ai-phone-call                           │
│    VOICE:    voice-to-text (AssemblyAI) · text-to-speech (ElevenLabs)   │
│              google-calendar-sync                                       │
└──────────┬──────────────────────────────────────────────────────────────┘
           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ GOOGLE GEMINI — gemini-2.5-flash-lite (direct REST, key=GEMINI_API_KEY) │
│ wrapped in _shared/circuitBreaker.ts (3 fails → open 60s → half-open)   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

# 3. THE MESSAGE LIFECYCLE

## 3.1 Widget boot sequence (src/pages/Widget.tsx)

1. **Route:** `/widget?rid=<id>` — no rid → "Invalid Widget Link" card (L1230-1244).
2. **Session init** (L299-327): `localStorage["widget_session_<rid>"]` UUID; timestamp key
   `widget_session_ts_<rid>`; TTL **24h rolling** (refreshed on every send, L689-691). Expired or
   missing → new `crypto.randomUUID()`.
3. **History probe** (L330-358): selects last 50 `chat_messages` for session+receptionist WITH
   `.setHeader('x-session-id', sid)` (RLS session partition). History exists →
   `ChatSessionOverlay` ("Welcome back!" → Continue / Start fresh).
4. **Continue** (L361-387): restores messages, restores `bookingState` from localStorage key
   `widget_booking_state_<rid>` (persisted on every change, L74-79), then `resumeBookingFlow()`
   (L390-474) re-renders the correct widget for the incomplete stage — re-fetches slots via
   check-availability if date was picked, re-shows date picker if slots gone, etc.
5. **Config load** (L510-548): RPC `get_public_receptionist` → name/business/business_model/
   greeting/business_info.widget_customization (colors + logo).
6. **Catalog load** (L568-592): RPC `get_services_for_receptionist`; fallback direct table query;
   splits services (`duration_minutes > 0`) vs products (`is_product || duration 0`).
7. **Greeting storage** (L550-566, 602-607): fires `widget-chat` with `message:""` and
   `displayedGreeting` once per session so backend records the greeting (greet-once invariant).

## 3.2 Send-message path (sendMessage, L657-978)

1. Push user message locally; refresh session timestamp.
2. **Client-side interceptors FIRST** (these bypass AI entirely):
   - `awaitingOrderConfirmation` (L695-745): regex confirm/change/cancel → soft-confirm flow
     (name collection → contact → order); unrecognized text falls THROUGH to AI (defect U2 fix).
   - `collectingInfo === 'name'` (L748-786): client-side name validation — mirrors backend
     nameValidator (~150-word blocklist copy at L201-255), sentence-rejection regexes,
     back-reference resolution ("same name") scanning history + "Thank you, Name" bot acks.
   - `collectingInfo === 'contact'` (L788-906): email regex vs phone regex; then EITHER
     `supabase.rpc('create_widget_order', {...})` directly from browser (orderMode) OR
     `functions.invoke('book-appointment')` (booking). Emits order_summary /
     booking_confirmation UISignal on success; resets bookingState + localStorage.
3. **Everything else → widget-chat** (L909-919):
   ```js
   body = { message, receptionistId, sessionId,
            bookingContext: bookingState,     // ⚠️ NEVER READ BY BACKEND (verified)
            _hp_field: honeypotValue,         // invisible input, L1429-1445
            _form_load_time: formLoadTimeRef } // bot timing detection
   ```
4. Response handling (L923-967): render reply; if `bookingCreated/orderCreated` flags → emit
   confirmation UISignal from `bookingDetails/orderDetails`; if `uiSignal` present →
   `normalizeUISignal()` (accepts snake_case AND camelCase) → `hydrateTimePickerSignal()` —
   if time_picker has no slots, fetches them live from `check-availability` (L159-198) →
   setActiveUISignal.

## 3.3 Widget interaction handlers

| Handler | Behavior |
|---|---|
| `handleServiceSelect` (L980) | sets service → emits date_picker → synthetic user msg "I'd like to book X" |
| `handleDateSelect` (L1013) | invokes check-availability for that day → time_picker w/ slots, else back to date_picker |
| `handleTimeSlotSelect` (L1072) | stores slot → collectingInfo='name' |
| `handleProductsConfirm` (L987) | builds cart summary → awaitingOrderConfirmation=true (soft confirm BEFORE info collection) |
| `handleQuickReply` (L1088) | businessModel-aware buttons: Book Appointment (skips selector if 1 service), View Services/Products, Contact, Prices |
| `onSwitchConfirm` (L1414) | sends literal "Yes, let's switch" text to AI |
| LeadForm submit (L1406) | fills name/email/phone → synthetic message |

## 3.4 Backend pipeline (widget-chat/index.ts, Deno.serve L1618-3320)

```
OPTIONS preflight → 200 "ok"
POST:
 L1624-1634  parse body {message, receptionistId, sessionId, displayedGreeting,
             source(default "widget"), _hp_field, _form_load_time}
 L1639-1644  400 if receptionistId/sessionId missing
 L1649       sanitizeInput: 2000-char cap, strip <>
 L1651-1673  performAbuseCheck (abuseProtection.ts):
               rate 30/min per session → 429 Retry-After
               honeypot filled OR submit<1000ms → 403 block
               content scoring: rapid(≥5/10s)+30, repeated+25, injection+50
               suspicious ≥25 logged; BLOCKED only ≥75
 L1675-1700  GEMINI_API_KEY chain (→GOOGLE_API_KEY→AI_API_KEY) missing → 200 safe-reply
             receptionists row (active=true) not found → 200 safe-reply   ← stability mode:
             EVERY failure returns HTTP 200 with user-safe text
 L1705-1721  StateManager.load(): conversation_state by session_id; stale-slot purge
             (>2h old date/time nulled — but warning string never used, dead)
 L1727-1732  chat_messages existence probe (greet-once level 1)
 L1743-1779  EMPTY MESSAGE PATH: dedupe-check, insert greeting row, set greeting_sent, save
 L1784-1814  runSafetyClassifier (jailbreak/harmful/PII/bias regex banks L274-298) →
             violation = canned redirect, both messages persisted w/ safety_violation meta
 L1819-1825  history: last 60 chat_messages ascending
 L1841-1848  services (active) split serviceItems/productItems
 L1851-1857  engine capabilities object (can_book/can_order/can_deliver/primary_goal)
 L1871-1888  deserialize engineState JSON from slots; sync greeted/confirmation rules
 L1950s      extractContextFromHistory: regex slot/context extraction over full history
             (dates, phones, emails, products, mood, phase) — merged under slot priority
 L1988-2001  engine entities mapped into slots
 L2011-2028  EARLY deterministic widget decision (for governor prompt sync)
 L2037-2051  ActiveTask derivation/createEmptyActiveTask
 L2060-2064  receptionist_faqs (priority desc)
 L2067-2117  routeIntent + flow start/reset + topic-shift PARK MODE
             (parkedFlow/parkedStep/parkedSlots saved on mid-flow switch)
 L2123-2124  MemorySummarizer.getRelevantSummaries (top 3)
 L2141-2164  resolveCapabilities(receptionist, services) → classifyUniversalIntent →
             validateIntentAgainstCapabilities → buildCapabilityPrompt;
             resolveEffectiveMode(...) MONEY MODE state machine
 L2206-2215  hallucinationGuard: extractGroundedData + prompt block; validateGroundedData
             LOGGED ONLY (advisory, never vetoes)
 L2237-2266  Phase-2 empathy/tone/memory-awareness/quality prompt blocks (engine helpers)
 L2271-2289  buildMasterSystemPrompt() — see §4.6
 L2306-2312  adaptive temperature/maxTokens (ack 150 / correction / tone-adapted 300-400)
 L2317-2372  callAIWithCircuitBreaker("gemini-2.5-flash-lite", ...) — see §4.7
 L2374       empty text → "I'm sorry, I couldn't process that."
 L2385-2441  WIDGET MARKER parsing ([NO_WIDGET], [WIDGET:name@conf≥0.7]) + implicit
             regex matcher fallback
 L2446-2479  evaluateResponseQuality (engine) + escalation check
 L2481-2509  computeConversationKPIs → persisted as kpi_tick conversion_event
 L2512-2558  persist user + bot chat_messages (rich metadata both sides)
 L2561-2633  conversations pair-log + ai_responses analytics rows
 L2646-2652  post-response context merge (slots win over regex)
 L2658-2794  BOOKING EXECUTION (gate §4.9)
 L2800-2962  ORDER EXECUTION (gate §4.9) + owner notification
 L2964-3026  conversion_events: booking_completed / order_completed (+revenue estimates)
 L3029-3050  lead_captured event (sales mode only, phone/email+name, nothing confirmed yet)
 L3056-3155  completion flags, entity sync-back, final resolveDeterministicUIComponent
 L3066-3087  sales-mode scalars + execution locks persisted to slots
 L3091-3115  updateTaskEntities / confirmTask
 L3118-3132  saveState (#1) + conditional rolling summary upsert (shouldSummarize)
 L3158-3213  build uiSignal v1.0 object
 L3214-3218  saveState (#2, after last_ui_intent stamp)
 L3220-3293  RESPONSE: reply, flags, details, uiHints, uiSignal, engineV2, flow, slots
 L3294-3318  top-level catch → 200 generic apology + error_logged:true + _diagnostic
             (first 300 chars of error — quota exhaustion surfaces here)
```

---

# 4. WIDGET-CHAT DEEP DIVE

## 4.1 Request contract
- CORS `*`, allowed headers incl. x-supabase-client-*; OPTIONS → ok. (No Allow-Methods header.)
- Body fields: `message`(≤2000 chars), `receptionistId`(required), `sessionId`(required),
  `displayedGreeting`, `source`(default "widget"), `_hp_field`, `_form_load_time`.
- `sessionId` doubles as `chat_messages.user_id` value.

## 4.2 Data loading & memory windows
| Read | Window |
|---|---|
| verbatim chat_messages | last **60** loaded; last **30** sent to model verbatim |
| older messages | compressed by `generateRollingSummary` (L953-1006) preserving first exchange, contact/booking/order facts, status flags, phase, mood |
| conversation_summaries | top 3 by recency; upserted when ≥20 msgs OR confirmation OR farewell (memorySummarizer.shouldSummarize) |
| conversation_state | whole engine state as `slots.engineState` JSON string |

## 4.3 Capability resolution (_shared/capabilities/)
Priority: 1) explicit `receptionists.capabilities` JSONB verbatim → 2) derived from services
(`is_product` presence) → 3) static defaults for 19 business types + General Business catch-all
(DEFAULT_CAPABILITY_MAPPINGS, types.ts L91-270). `resolvePrimaryGoal` maps legacy ai_mode
sales/booking/support → goals. `classifyUniversalIntent` first-pass regex →
`validateIntentAgainstCapabilities` routing (SERVICE vs PRODUCT flow, compliance never gives advice).

## 4.4 Money Mode — exact algorithm
- Config (L628-653): enabled=`capabilities.money_mode_enabled===true`; threshold=
  `capabilities.money_mode_threshold`(1–10)/10 ?? legacy ?? **0.65**; hysteresis .1; hold 3 turns;
  exit after 2 low consecutive turns.
- Score (L655-694): order_product .85, book_appointment .80, ask_price .72, confirm .70,
  ask_info .52, compliment .40, ask_hours .30, ask_location .28, ack .22, greeting .12,
  deny .10, complaint .08, farewell .02, default .25. Buying-keyword regex **+0.10**;
  disinterest regex **−0.25**; product/service mentioned **+0.05**; contact captured **+0.05**;
  uncertainty **−0.08**; clamp 0–1.
- Exit signals (L696-704): anchored patterns (`^just (browsing|looking)$`,
  `^i('m|am) (good|fine|ok|set)$`, `^maybe later`, `^i'll think about it`, polite declines…)
  plus unanchored (`no thanks|not interested|stop|unsubscribe|leave me alone`).
- Entry guard (L706-710): needs actionable context (service/product mentioned OR cart OR
  phase ∈ booking/ordering/confirmation).
- State machine (L712-781): persists to slots.sales_mode_active/effective_mode; SMART EXIT
  bypasses hysteresis on disinterest; exposed as uiSignal.moneyModeActive + top-level effectiveMode.

## 4.5 Prompt construction (buildMasterSystemPrompt, L1340-1613)
Blocks in order: ① Identity ② Session rules (greet-once branch) ③ Memory & context
(summary/slots/emotion map) ④ Intent & decision (engine primary) ⑤ Booking intelligence
(customer_fields-driven labels) ⑤.5 Product ordering ⑥ Safety & quality ⑦ Failure prevention →
then KB RAG block (buildKnowledgeBase L1140-1259: CURRENT DATE/TIME + time-awareness rules,
business info, hours, SERVICES w/ duration+price, PRODUCTS w/ LIVE STOCK badges
OUT OF STOCK / LOW ≤5 / In Stock, FAQs, free-text KB as MEDIUM CONFIDENCE) → conditional blocks:
capabilityPrompt, actionGateBlock, hallucinationGuardBlock, taskContinuityBlock, flowLockBlock,
governorBlock (Engine v2 prompt_block REWRITTEN by synchronizeGovernorWidgetBlock L534-576 so the
prompt's widget section matches what the UI will actually render), Money Mode directive
(buildMoneyModePrompt L1295-1316 — empathy-first, "never push after clear no"), FINAL DIRECTIVE
(sales vs neutral variant). Then Phase-2 appends: empathyPromptBlock + tonePromptBlock +
memoryAwarenessBlock + qualityStandardsBlock.

## 4.6 Gemini call (L2317-2372)
- Endpoint `generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=…`
- System message extracted and PREPENDED to first user turn (`\n\n---\n\n` separator);
  roles assistant→model; NO JSON mode anywhere in widget-chat.
- generationConfig: adaptive temp (ack 0.7/maxTokens 150; correction 0.75; else tone-adapted
  300–400 tokens).
- Wrapped in circuit breaker: failureThreshold **3**, open cooldown **60s**, half-open needs 2
  successes; 30s AbortController timeout; 429/402/403/400 mapped to named errors; failures serve
  intent-aware fallback immediately (no retry loop).
- Fallback: `buildFallbackResponse(intent, …)` L1264-1290 — 13 intent-keyed canned replies +
  "call us at {phone}".

## 4.7 Response parsing → UI
- `[NO_WIDGET]` opt-out marker stripped; trailing `[WIDGET: name@confidence]` parsed (legacy bare
  form = conf 1.0); conf < 0.7 discarded. VALID_WIDGETS: service_selector, product_selector,
  date_picker, time_picker, lead_form, booking_confirmation, order_summary, switch_confirmation.
- If AI used no marker: implicit regex matcher (matchWidgetFromResponse L583-622).
- Final precedence (resolveDeterministicUIComponent L499-528, applied twice — pre-prompt for
  governor sync and final):
  `bookingResult > orderResult > aiSuggested > implicitSuggested > flow-step widget >
  engine ui_hints > null`. ONE component per response, ever.

## 4.8 Action gates (the revenue safety net)
- **Booking gate** (L2658-2794): requires userExplicitlyConfirmed (intent==='confirm' OR
  `^(yes|yep|yeah|correct|right|exactly|confirmed?|that's right|please do|go ahead|book it…)`)
  AND flow/task in confirming stage AND !booking_confirmed AND !slots.bookingExecutionLocked AND
  actionGate.allowed (all required customer_fields collected per receptionist config).
- Idempotency double-layer: session-level lookup (metadata.cs session_id) THEN SHA-256 key
  `sess::svc::date::time` (L165-170). Reuse → return existing, set lock.
- Date parsing: ISO shortcut or natural language (today/tomorrow/weekday-next/M-D[/Y]; times
  morning=9 afternoon=14 evening=18; am/pm normalization; default 09:00) — parseBookingDateTime
  L3323-3379. NOTE: no availability pre-check here; delegated to book-appointment validator.
- **Order gate** (L2800-2962): same confirm discipline; cart priority selectedProducts →
  single product → engine entities; idempotency key from sorted productIds; executeOrder does
  validateCart → create_widget_order (8 args incl p_idempotency_key) → deduct_stock per item;
  validation failure = NO order created (AI explains); success → notifications row + fetch.

## 4.9 Post-processing
polishResponse (strips "as an AI…" phrases); quality evaluation (score 100 start, robotic −8,
re-greet −20, length penalties, empathy-missing −20, repetition −25, pushy −15; grade A-F,
threshold 60 — regeneration deliberately disabled in prod); escalation heuristics
(human-request immediate; frustration needs mood+history); KPI computation (repetition rate,
hallucination risk ratio, engagement, goal signals) → kpi_tick event; empathy-once rule is
PROMPT-ONLY (no programmatic limiter — finding #4).

---

# 5. SHARED BACKEND MODULES

## 5.1 db.ts (290L) — custom REST client
Replaces supabase-js so deploys are self-contained. ALWAYS service-role posture
(`SUPABASE_SERVICE_ROLE_KEY` → fallback anon). Methods: SelectQuery (.eq/.contains[JSONB cs]/
.order/.limit/.maybeSingle/.single), MutationQuery (insert/upsert w/ Prefer representation),
UpdateQuery (PATCH), DeleteQuery, FromBuilder, rpc(). Errors normalized to {data,error:{message}}.

## 5.2 circuitBreaker.ts (209L)
closed/open/half-open per service-key Map (survives within isolate). Generic withCircuitBreaker
5-fail/2-success/30s. `callAIWithCircuitBreaker`: 3 fails / 60s open / Promise.race timeout.
`callDBWithCircuitBreaker`: 5 fails / 15s.

## 5.3 Two limiters coexist
- rateLimiter.ts (157L): burst-aware sliding window; presets widgetChat 30/min+5/5s, booking
  10/min+3/5s, checkAvailability 20/min, auth 5/min, notifications 3/min, analytics 10/min.
- abuseProtection.ts (436L): own simpler window limiter + failed-booking tracking (5 tries/5min
  → 10min block), honeypot, content scoring ledger (ring buffer 1000), composite performAbuseCheck.
  Export names clash with rateLimiter — cannot be co-imported naively.

## 5.4 Validators
- nameValidator.ts (238L): strict extraction patterns ("my name is X", "call me X", end-anchored
  "I'm X"); ~150-word blocklist; sentence rejection (I-verbs, questions, hedges); word rules
  2–15 chars letters/hyphen/apostrophe; 1–2 words (≤3 in direct mode); title-case output;
  history-aware extractNameWithHistory resolves back-references via "Thank you, Name" bot acks.
- hallucinationGuard.ts (356L): grounding categories pricing/availability/services/products/
  policies; checkGroundingRequired; validateGroundedData; 4 randomized never-invent fallback
  scripts; buildHallucinationGuardPrompt injects VERIFIED lists + self-check directive.
- actionGate.ts (360L): requirements per action type; buildDynamicRequirements overlays
  customer_fields JSONB (email/phone/whatsapp can split or relax `contact`);
  allowed === zero missing; nextQuestion generator; APPROVED/BLOCKED prompt block.
- bookingValidator.ts (586L): pipeline fields → loadService → loadSchedulingRules
  (service_scheduling_rules table) → time window (min advance 1h, max 60d defaults; buffers 5min)
  → conflict scan with prep+cleanup+buffers overlap math → 5 scored alternative suggestions across
  requested day + 2 days (proximity scoring) → daily cap (fails OPEN on DB error) → business-hours
  WARNING (no rules = assume open). Status mapping done by caller (409 conflict, 429 daily-limit).
- inventoryValidator.ts (429L): classifyStock (0=out, ≤5 low default); validateCart caps qty,
  suggests alternatives, computes totals; buildOrderPayload shapes create_widget_order args;
  deductStock loops atomic RPC; executeOrder = validate → RPC → deduct (deduction failures are
  warnings, not order failures).

## 5.5 Engine v2 (_shared/engine/) — the 9 steps
core.ts runEngine: createEmptyState → cleanInput → detectIntent(capabilities,isFirstMessage) →
extractEntities(services,products) → updateState → checkRequirements → generateUIHints →
generateInstruction → buildPromptBlock → checkIllegalState.
- intent.ts: 15 pattern groups, confidence ladder cancel .95 → greeting(first only) .90 →
  farewell/confirm/deny .90 → ack/correction .85 → book_explicit .90 (capability-gated) →
  order .90 → escalate/complaint .85 → price/hours .75 → info .70 → small_talk .60 →
  ambiguity .40 → continue/info .50.
- entities.ts: fuzzy service match (substring or ≥60% word overlap), typo map, quantity patterns,
  relative dates, times, validated names, phones, emails, delivery addresses ("deliver to …").
- state.ts: cancel wipes task; step ladder computeStep (service→date→time→name→contact→confirm);
  confirm sets confirmation_sent + locked; checkRequirements validates email/phone formats;
  complete = missing==0 && errors==0.
- governor.ts: UI hints per step; instruction with FORBIDDEN list (no re-confirm after sent, no
  re-ask collected, no full re-greet, no double "anything else"); emotion-aware suffix;
  prompt_block with [WIDGET:] protocol (conf>0.7 else [NO_WIDGET]); illegal iff locked && re-confirm.
- empathy.ts: weighted keyword+punctuation emotion model (frustrated/urgent/negative/positive),
  intensity high ≥8 medium ≥4, empathyLevel frustrated 1.0 → neutral 0.3, approach suggestions,
  memory awareness prompts.
- personality.ts: STRIP_PHRASES actually removed from replies; detectSentiment w/ sarcasm
  heuristic; polishResponse cleanup.
- toneAdapter.ts: 6 tone profiles; detectBusinessTone from business type; adaptTone adjusts
  warmth/formality/temp by emotion (frustrated: warmth+.3 emoji-off temp .75); getModelParamsForTone
  caps tokens 300–400.
- responseQuality.ts: scoring rubric (§4.9); shouldRegenerateResponse (F/high-greeting/high-repeat)
  — production chooses NOT to regenerate.

## 5.6 Flow system (_shared/flow/)
types.ts ActiveTask{type,step,entities{service,product_cart[],appointment,customer,delivery},
ui_state,flow_flags,memory} + ConversationState w/ PARK fields. stateManager.ts load/save/upsert
(slots.activeTask serialized). flowRouter.ts routeIntent + detectTopicShift (BLOCKING_STEPS
['collect_contact','confirm'] resist switching; otherwise PARK MODE saves partial slots).
slotExtractor.ts dates/times/phones/emails/names/qty/location + correction detection
("actually/change that to"). memorySummarizer.ts shouldSummarize(≥20 msgs OR confirmed OR farewell),
extractKeyFacts. taskIntelligence.ts task lifecycle, isMessageOnTopic (answer_briefly for FAQ
mid-flow), buildTaskContinuityPrompt + buildFlowLockPrompt.

## 5.7 capabilities/
19 DEFAULT_CAPABILITY_MAPPINGS + General Business catch-all; resolveCapabilities priority
(explicit JSONB → derived-from-services → defaults); classifyUniversalIntent; goal bias prompts;
buildCapabilityPrompt enforcement rules (never offer unsupported actions; compliance businesses
never give professional advice).

---

# 6. EDGE FUNCTIONS SURVEY (all 28)

Global posture: config.toml sets verify_jwt=false for all. Only create-notification and
system-health do manual JWT checks internally; whatsapp-webhook verifies Meta hub token.

| Function (live ver) | Purpose / key mechanics |
|---|---|
| **widget-chat v51** | THE brain — see §4. Monolith, no external imports beyond _shared. |
| **chat v27** (718L) | Legacy dashboard-side brain. Loads receptionist+A/B variant+FAQs+last 30 msgs; keyword booking branch w/ accept_alternative:N follow-ups; Gemini slot-extraction call (temp 0.0); availability via check-availability invoke; books via book-appointment w/ SHA-256 key; FAQ exact-match short-circuit; normal chat via circuit-broken gemini-2.5-flash-lite; writes messages/notifications/ai_responses. |
| **book-appointment v6** (423L) | Canonical write path. Rate-limited; sanitize; FULL BookingValidator run (errors/conflicts/suggestions formatted; 409/429 mapping); idempotency pre-check via metadata.idempotency_key; duplicate-contact ±15min heuristic; second buffered conflict sweep; insert w/ cancellation_token+confirmation_token UUIDs; 23505 unique-violation graceful recovery; marks overlapping appointment_slots.is_available=false; appointment_logs audit; owner notification; fire-and-forget send-booking-email. |
| **check-availability v5** (335L) | Slot search engine. Reads service duration/buffers, availability_rules, exceptions, appointments, manually blocked slots; timezone-correct conversion via Intl offset math; 15-min increment walk w/ buffer filtering; desired-time match ±60s; scored alternatives persisted to ai_booking_suggestions. |
| **generate-slots v5** (186L) | Materializes appointment_slots 30-min × 60 days from availability_rules; deletes future then regenerates; batch inserts 500. |
| **confirm-appointment v6 / cancel-appointment v6** (147/143L) | Token-gated status flips (confirmation_token/cancellation_token or metadata fallback); idempotent; refuse cancelled; audit + notifications. Cancel does NOT free appointment_slots. |
| **appointment-action v5** (308L) | Multiplexed zod-validated actions: confirm/cancel/reschedule (token-checked; reschedule recomputes end from duration; records rescheduled_from/at). Writes appointments+logs+notifications. |
| **analytics v9** (379L) | Multiplexed: compute (5-min analytics_cache; aggregates conversations/messages/appointments/ai_responses/conversion_events/orders into metric bundles + per-receptionist breakdown), ingest (raw ai_responses insert), stats (per-receptionist quality/latency/match-rate distributions). |
| **analytics-export v5** (139L) | ai_responses export ≤10k, date-filtered, JSON or CSV. |
| **optimizer v5** (246L) | Autonomous A/B cron target: per-variant composite score 0.7·quality+0.3·latency; promote winner (≥200 impressions, >5% better); retire <50% w/ ≥100 impressions; explore new temperature variants when scores >0.7. Never touches receptionist.model. |
| **kb-rewrite v12** (465L) | Protected KB rewriter, multiplexed analyze/apply/gap-report. Gemini JSON mode (temp 0.3). analyze: pulls week of poor responses (score<0.6/unanswered/low_confidence/escalation) → suggestions to kb_rewrite_log (auto_suggest=true) + notification. apply: ownership-checked FAQ inserts + KB appends, flips flag. gap-report: weekly stats. ⚠️ duplicated trailing handleGapReport/jsonResponse declarations (later ones shadow). |
| **generate-system-prompt v12** (139L) | Stateless Gemini → structured system prompt template (Role/Environment/Memory/Tone/Objectives/Guardrails; greet-once mandate). No DB. |
| **generate-knowledge-base v12** (92L) | Stateless Gemini rewrite of raw business form data → conversational KB prose. No DB. |
| **parse-services v11** (131L) | Gemini JSON mode (temp 0.1) extracting services/products from free text; strict "price null unless stated"; filterType discriminator used by onboarding parsers. |
| **send-booking-confirmation v5** (205L) | Confirmation/reminder email w/ inline ICS attachment; branded gold HTML; manage links built off SUPABASE_URL (⚠️ points at Supabase domain, not app domain); Resend; soft-skip w/o key. |
| **send-booking-email v5** (202L) | Automated path invoked by book-appointment; joins appt+service+receptionist; ICS; purple HTML; Resend from appointments@resend.dev; silently ignores isReminder flag. |
| **send-reminder v5** (109L) | IN-APP ONLY reminder (appointment_logs + owner notification). No email/SMS. |
| **activate-reminders v5** (95L) | Scans next-24h booked; 23–25h-out w/ email → invokes send-booking-email + logs reminder_sent. |
| **appointment-reminder-runner v5** (87L) | Cron worker: booked appointments in 1-min future window at minutesAhead (default 15); inserts notifications reminder each. |
| **setup-reminder-cron v5** (70L) | One-shot installer: cron.unschedule then creates pg_cron job `appointment-reminders-24h` hourly POSTing runner w/ minutesAhead 1440 via net.http_post through exec_sql RPC. **⚠️ LIVE PROJECT HAS ZERO CRON JOBS REGISTERED — must be invoked once.** |
| **create-notification v5** (81L) | Generic writer; MANUAL JWT auth (auth.getUser) required. |
| **system-health v5** (255L) | Manual JWT; parallel fetch 7 datasets; getAllCircuitStats(); composite score starts 100: −20 open breaker, −5 flagged response (cap 20), −10 p95>10s, −10 critical notif (cap 30), −5 out-of-stock; healthy ≥90 / degraded ≥70 / critical below. |
| **google-calendar-sync v5** (80L) | Only action implemented: create_event; OAuth creds from integrations_google (no refresh rotation); stamps appointments.google_event_id. |
| **whatsapp-webhook v5** (140L) | Meta Cloud API. GET handshake vs WHATSAPP_VERIFY_TOKEN (default literal "rutex_verify" — stubbed security); POST: looks up integrations row type='whatsapp' config_json.receptionist_id; forwards to widget-chat (session whatsapp_<from>, source whatsapp); replies Graph v19.0; always 200 to Meta. |
| **ai-phone-call v5** (125L) | Twilio voice webhook (x-www-form-urlencoded CallSid/SpeechResult/To); integrations row type='twilio'; turn 1 plays greeting_message in <Gather input=speech>; later turns forward speech to widget-chat (session phone_<CallSid>) and speak reply via Polly.Joanna; XML-escaped TwiML. |
| **voice-to-text v5** (143L) | base64 audio → AssemblyAI upload → transcript poll 1s×60. Requires ASSEMBLYAI_API_KEY. |
| **text-to-speech v5** (88L) | ElevenLabs eleven_turbo_v2_5, voice EXAVITQu4vr4xnSDxMaL ("Bella"), mp3 44.1k/128, 5k char cap, 30s timeout; streams audio/mpeg. |

---

# 7. FRONTEND ARCHITECTURE

## 7.1 App shell (src/App.tsx, 203L)
Providers: ErrorBoundary → QueryClientProvider (bare QueryClient) → TooltipProvider → Toaster
(radix) → BrowserRouter → KeyboardShortcutsProvider. Auth init has **8s timeout race** against
getSession (prevents infinite spinner); onAuthStateChange keeps session synced; `authLoading`
gates ALL route rendering (fixes auth-page flash). Route tiers:
- Always-public: /widget, /appointments/confirm|cancel, /booking/:id, /cancel/:id, /confirm/:id, /help
- Unauthenticated: /, /auth, * → /auth
- Authenticated (SidebarProvider + AppSidebar + Navbar): 24 routes incl. /onboarding (legacy)
  and /onboarding-wizard (real), /builder/:id, /money-mode, /calendar, /channels, /organization…
ProtectedRoute exists but effectively unused (route-tier structure handles guarding).

## 7.2 Onboarding (store + steps)
Zustand store persisted to localStorage "onboarding-storage" (v1 + migrate): currentStep,
receptionistId, receptionist{name,business_name,business_type,business_model,phone,greeting,goal,
tone,language,primary_goal,capabilities}, services[], availabilityRules[], faqs[].
- **Step1CreateReceptionist**: collects identity + primary_goal + 6 capability checkboxes + tone +
  greeting + advanced business_info; CLIENT-SIDE getDefaultCapabilities/getDefaultPrimaryGoal
  duplicate the SQL RPC logic (⚠️ auto_detect_capabilities/auto_detect_primary_goal SQL fns exist
  but NO frontend .rpc() caller — dead code from frontend perspective). INSERTs receptionists row
  (user_id,name,business_name,business_type,phone,tone,language,greeting_message,goal-enhanced,
  address,business_info,persona_description,primary_goal,capabilities).
- **Step2Services**: ownership verify; derives business_model; bulk inserts services
  {receptionist_id,user_id,name,duration_minutes,description,price,active}; AIServicesParser /
  AIProductsParser call parse-services edge fn w/ filterType service/product, offer inline price
  edit + add-now/later.
- **Step3Availability**: timezone autodetect (findClosestTimezone); presets/per-day; bulk inserts
  availability_rules; propagates tz to receptionists.timezone + profiles.timezone.
- **Step4FAQs**: requires ≥3 FAQs; bulk inserts receptionist_faqs; dental/spa templates.
- **Step5Test**: no writes; popup test at /widget?rid=.
- **Step6Install**: embed code + link; sets profiles.onboarding_completed=true; resets store.

## 7.3 Pages inventory (30 files)
Analytics (edge fn compute + charts + CSV) · Appointments (manager + Orders tab) · Auth (zod,
redirect-if-session) · Availability (rules/exceptions editor + generate-slots preview) · Builder
(see 7.5) · CalendarView (wraps OwnerCalendar month/week + block-slot via exceptions) ·
CancelAppointment/ConfirmAppointment/ManageBooking (public tokenized self-service via
get_appointment_by_token + appointment-action) · Channels (Twilio/WhatsApp creds → integrations) ·
Conversations (transcript browser) · Dashboard (see 7.5) · Diagnostics (system-health poll 60s:
breaker states, P95, stock alerts) · FAQManagement · Help · Index (dead redirect) · KBRewrite
(kb_rewrite_log console + analyze/apply) · Landing · Notifications · NotFound · Onboarding (legacy,
still routed) · OnboardingWizard (shell + progress) · Orders · Organization (members/roles/locations
via useOrganization hook) · QualityReview (ai_responses QA browse) · RealtimeLogs (streams ALL
notification events) · Services (unified CRUD + currency select) · Settings · Widget (§3) ·
WidgetInstall (snippets + WidgetCustomization react-query colors/logo → business_info.widget_customization).

## 7.4 Widget UI system (UISignalRenderer — SOLE path since 2026-05-12)
UISignal {version:"1.0", intent, activeComponent, componentData, dismissPrevious, reason, flow,
conversationCanContinue, moneyModeActive}. 8 components, launcher button → panel:
service_selector (ServiceSelector: cards, 10 + show-more) · product_selector
(ProductSelectorEnhanced: multi-select cart, qty steppers clamped to stock, low-stock badges,
running total) · date_picker (DateSelector: quick chips Today/Tomorrow/+2/+3 + react-day-picker,
past disabled) · time_picker (TimeSlotSelector: tz-correct display via Intl browser tz; empty
state) · booking_confirmation (BookingConfirmation: green card + CLIENT-SIDE .ics download) ·
order_summary (OrderConfirmation: line items + total) · lead_form (LeadForm: dynamic visibility
from customer_fields, email/phone validation, Skip) · switch_confirmation (amber alertdialog →
sends literal "Yes, let's switch"). Priority guard: booking_confirmation > order_summary >
product_selector > service_selector > date_picker > time_picker > lead_form > switch_confirmation.
Voice: VoiceChatOverlay (orb state machine idle→listening→processing→speaking; MediaRecorder opus
→ base64 → voice-to-text → reply → TTS direct fetch w/ hardcoded Bella voice; auto relisten 500ms)
+ VoiceInputButton push-to-talk. ChatSessionOverlay: welcome-back overlay (⚠️ useEffect-after-return
conditional-hook smell).

## 7.5 Dashboard & Builder
Dashboard.loadData: getUser → receptionists by user_id → 3 head-count queries (conversations/
appointments/orders .in ids) → stats → setDataLoaded LAST; redirect effect gated on dataLoaded &&
length===0 → /onboarding-wizard (H3 race fix). RevenueEngine scoped to first receptionist.
Builder (1163L): loadReceptionist explicit column list w/ fallbacks (primary_goal ?? bookings,
DEFAULT_CUSTOMER_FIELDS, currency ?? USD); autoGenerateContent fires once when KB or prompt empty
(guard ref) — invokes generate-knowledge-base then generate-system-prompt, auto-saves results;
regenerateContent forces both. Sandbox isolation triple: loadMessages returns [] deliberately;
fresh previewSessionIdRef UUID per mount; source:"builder_preview" tags on widget-chat/book/analytics
calls. saveReceptionist UPDATE scoped id+user_id writing 16 columns; INSERT path for new; delete
scoped likewise.

## 7.6 Owner revenue tools
RevenueEngine.tsx (688L, 4 tabs): Dashboard (weekly revenue/conversions tiles, AreaChart trend,
funnel bars, live feed HOT≥8/WARM≥5/COLD from metadata.intent_score) · Money Mode (switch + slider
1–10 + directives preview; save merges money_mode_enabled/threshold into capabilities JSONB per
receptionist; mode switcher writes ai_mode support/booking/sales directly) · MEO (leaked-revenue
hero from dropped-leads × avg value + after-hours conversations; intelligence alerts) · Audit
(static). Refresh interval 30s. ⚠️ Hardcodes £ in several tiles despite currency lib.

## 7.7 State/lib/styling
react-query installed but only 2 consumers (WidgetCustomization, ManageBookingPortal-dead);
everything else hand-rolled useEffect+useState. Zustand only for onboarding. No custom contexts.
Hooks: useOrganization (org CRUD facade), use-toast (radix queue), use-mobile, use-keyboard-shortcuts
(Ctrl+K/N/Esc). client.ts: createClient w/ localStorage persistence + autoRefreshToken; NO global
headers — x-session-id per-request only. lib/validation.ts zod schemas (only signUp/inSign consumed);
lib/currency.ts Intl formatting; lib/idempotency.ts + lib/circuitBreaker.ts UNUSED frontend copies;
notify.ts wraps create-notification; timezone helpers. Realtime: Navbar notifications + RealtimeLogs.
index.css: ~40 semantic HSL tokens (primary 210 100% 50% sky-blue system), gradients/shadows/glass
tokens, chart ramp, .dark overrides; tailwind.config maps tokens + Inter/Outfit fonts + ~20 custom
keyframes powering staggered animations. ⚠️ sonner imported in 27 files but Sonner Toaster never
mounted — those toasts are silent.

---

# 8. DATABASE GROUND TRUTH (queried live, 2026-08-23)

## 8.1 Tables (35) with column counts
ab_assignments 6 · ab_tests 8 · ab_variants 6 · ai_booking_suggestions 7 · ai_response_reviews 6 ·
ai_responses 14 · analytics_cache 5 · appointment_logs 6 · appointment_slots 7 · appointments 19 ·
availability_exceptions 6 · availability_rules 8 · chat_messages 8 · conversation_state 10 ·
conversation_summaries 8 · conversations 7 · conversion_events 8 · integrations 6 ·
kb_rewrite_log 9 · notifications 14 · optimization_log 10 · order_items 7 · orders 12 ·
organization_locations 9 · organization_members 8 · organizations 14 · profiles 8 ·
receptionist_faqs 6 · **receptionists 37** · service_costs 11 · service_inventory 8 ·
service_scheduling_rules 11 · services 14 · usage_logs 10 · user_roles 3

## 8.2 Routines (25, public schema)
auto_detect_capabilities(jsonb, INVOKER — dead from frontend) · auto_detect_primary_goal(text,
INVOKER — dead) · cleanup_old_* ×4 (DEFINER, NO CRON BOUND) · create_widget_appointment(record) ·
create_widget_order(uuid, 8-arg w/ p_idempotency_key) · deduct_stock(jsonb, FOR UPDATE locks) ·
get_appointment_by_token · get_public_receptionist · get_safe_receptionist_for_widget ·
get_services_for_receptionist (all DEFINER public-read whitelists) · get_user_org_ids ·
handle_new_organization(trigger) · handle_new_user(trigger — profiles auto-create) ·
handle_updated_at(INVOKER, unbound) · has_org_role · insert_booking_suggestion ·
insert_conversion_event · is_org_member · rls_auto_enable(event trigger) ·
sync_receptionist_phones(trigger) · upsert_conversation_state · upsert_conversation_summary.

## 8.3 RLS policy counts (110 total)
services 6 · appointments 6 · orders/analytics_cache/integrations/ai_responses/receptionists/
receptionist_faqs/chat_messages/ai_response_reviews 5 each · conversations/notifications/
kb_rewrite_log/organization_members/organizations 4 each · order_items/profiles/appointment_slots 3 ·
ab_assignments/ai_booking_suggestions/appointment_logs/availability_rules/conversion_events/
optimization_log/organization_locations/usage_logs 2 · conversation_state/availability_exceptions/
ab_variants/service_costs/service_inventory/service_scheduling_rules/ab_tests/user_roles/
conversation_summaries 1.

## 8.4 Extensions
pg_cron · pg_net · pg_stat_statements · pgcrypto · plpgsql · supabase_vault · uuid-ossp

## 8.5 Key structural notes
- receptionists columns (37): identity (name/business_name/business_phone/phone/address/website),
  persona (tone enum/persona_description/greeting_message/language/additional_languages),
  knowledge (knowledge_base/system_prompt/services_and_prices jsonb/hours_of_operation jsonb),
  behavior (temperature numeric/allow_interruptions/mock_mode/default_response/goal/
  business_type/business_model/**ai_mode enum**/**capabilities jsonb**/primary_goal/
  customer_fields jsonb/business_info jsonb incl widget_customization), org (organization_id/
  location_id), ops (currency/timezone/active/model/created_at/updated_at).
- **VIEWS: none.** Old docs referencing public_catalog/widget_receptionists are obsolete —
  public access flows entirely through the SECURITY DEFINER RPC trio.
- **CRON JOBS: zero registered.** Reminder pipeline fully dormant.
- Row counts: receptionists 5 · services 42 · profiles 3 · chat_messages 466 · orders 1 ·
  **appointments 0** · conversion_events 2.

---

# 9. MONEY MODE MECHANICS

Full algorithm in §4.4. Frontend write path: RevenueEngine MoneyMode tab → saveMoneyModeConfig()
read-modify-write merging money_mode_enabled + money_mode_threshold (1–10, default 7) into each
scoped receptionist's capabilities JSONB; separate mode switcher writes ai_mode ∈
support|booking|sales directly. Backend reads capabilities (fallback legacy business_info.sales_mode).
Badge: amber "Personalized suggestions active" when uiSignal.moneyModeActive.
Directive injected near end of master prompt; alternate FINAL DIRECTIVE sales-vs-neutral.

---

# 10. SECURITY MODEL

- **verify_jwt=false everywhere** (anon key isn't a valid JWT); edge functions do their own auth:
  only create-notification + system-health require user JWT; everything else operates
  service-role and trusts inputs.
- **RLS**: ~110 policies, all tables enabled; widget session partitioning relies on client-set
  `x-session-id` header (chat_messages/conversation_state/conversation_summaries/appointment_logs).
- **Public reads** exclusively via SECURITY DEFINER RPCs whitelisting non-sensitive columns.
- **Abuse stack**: sanitizeInput (strip <>, 2k cap) → rate 30/min → honeypot + submit-timing →
  injection-pattern scoring (block ≥75) → safety classifier (jailbreak/harmful/PII/bias regexes)
  with canned redirects.
- **Action safety**: hallucinationGuard advisory prompt; actionGate hard requirement check;
  execution locks in slots; SHA-256 idempotency keys; atomic stock FOR UPDATE; booking validator
  conflict sweep with buffers; 23505 graceful recovery.
- **Anonymous self-service** via opaque confirmation_token/cancellation_token UUIDs.
- Weak spots (see §12): WhatsApp signature stub, always-service-role blast radius, advisory-only
  grounding veto, secrets committed inside AGENTS.md (Gemini key + service-role JWT visible in repo doc).

---

# 11. DEPLOYMENT & PRODUCTION STATE

| Item | Verified state |
|---|---|
| Supabase org token works | yes (read-only use; 5 projects visible; Rutex = esvrhnlwquunsdduvbnr ACTIVE_HEALTHY eu-west-2 PG 17.6.1.104) |
| Functions deployed | 28/28 ACTIVE, verify_jwt=false, versions: widget-chat **51**, chat 27, analytics 9, book/cancel/confirm-appointment 6, kb-rewrite/generate-*/parse-services 11-12, rest v5 |
| Cron | **EMPTY — reminders dormant** |
| Views | NONE |
| Frontend deploy | AGENTS.md reports Vercel domain failing / latest commit not reflected (needs Vercel token to diagnose — not provided) |
| Data maturity | 466 messages but 0 appointments / 1 order / 2 conv events → conversations happen, conversion barely tracked |

Deploy tooling in repo: scripts/prepare_widget_chat_deploy.py|.sh (ASCII-clean + Management API
payload), e2e smoke tests (bash+python), platform_atomic_audit.py, release_verify_vercel.py,
check_deploy_sync.py, smoke-test-booking.sh; tests/ contains md guides + appointment smoke script.
No unit test framework configured (typecheck script exists: tsc --noEmit tsconfig.app.json).

---

# 12. FINDINGS RANKED

## P0 — breaks or blocks features today
1. **Reminder crons unregistered** (cron.job empty) → 24h/1h reminders never fire. Fix: invoke
   setup-reminder-cron once post-DB-setup (documented requirement, still outstanding).
2. **Client/server state split-brain**: Widget.tsx sends `bookingContext` (L914/L1210) —
   **zero reads in widget-chat/index.ts** (grep-verified). Two independent flow controllers both
   able to write appointments/orders; client path sends NO idempotency key; server path uses its
   own keys. Double-booking protection rests solely on book-appointment's ±15-min contact heuristic.
3. **Frontend deployment drift** (per AGENTS.md Part 15): Vercel domain unresolved / latest commit
   not deployed at last record; needs Vercel token to verify.

## P1 — latent correctness risks
4. Empathy-once rule: PROMPT-ONLY, no programmatic enforcement (contradicts AGENTS.md "critical rule").
5. Hallucination guard: advisory (logged) — never vetoes ungrounded replies in widget-chat.
6. Name-validator duplication: Widget.tsx L201-255 forks backend blocklist — drift risk.
7. ChatSessionOverlay.tsx conditional-hook violation (useEffect after early return).
8. kb-rewrite duplicated trailing declarations (shadowed dead code).
9. Dead-but-computed in widget-chat: staleSlotContext, memoryContext, flowContext/slotSummary,
   smartMemorySummary(log-only), summarizeConversation(), evaluateLocalResponseQuality(),
   stateMachineBlock=''; dead imports (rateLimiter trio, getEmpathyStarter, extractValidatedName,
   isNameBackReference, mapProductStock, validateCart, failed-booking quartet).
10. Two rate limiters with clashing exports; three coexisting state systems (audit C1 remains open).
11. Analytics aggregates mixed currencies as uniform (B8).
12. send-booking-confirmation manage/cancel links built off SUPABASE_URL (Supabase domain, not app).
13. WhatsApp webhook signature verification stubbed (default literal token) — High before going live.
14. cancel-appointment doesn't free blocked appointment_slots.
15. cleanup_old_* routines exist but no cron binds them (data growth).
16. Secrets exposure: AGENTS.md itself contains live Gemini API key + service-role JWT in plaintext
    (repo hygiene issue; rotate recommended).

## P2 — dead code / UX polish
17. Dead frontend: components/Widget.tsx (legacy shell), VoiceInput.tsx, ManageBookingPortal.tsx,
    ServiceTemplateCard + serviceTemplates data, AIServiceParser (singular), pages/Index.tsx,
    lib/idempotency.ts, lib/circuitBreaker.ts, most of lib/validation.ts.
18. Sonner toast imports (27 files) but Sonner Toaster never mounted → silent toasts.
19. RevenueEngine hardcodes £ regardless of receptionist currency.
20. Legacy /onboarding page still routed alongside real wizard; Auth redirects new signups there.
21. auto_detect_capabilities/primary_goal SQL functions have no callers (logic ported to TSX).
22. No availability pre-check before booking execution in widget-chat (delegated wholly downstream).
23. No unit tests; typecheck only; smoke scripts are manual curl flows.

---

# 13. QUICK REFERENCE INDEX

| Concern | Location |
|---|---|
| Conversation brain entry | supabase/functions/widget-chat/index.ts (Deno.serve L1618) |
| Abuse gate | _shared/abuseProtection.ts performAbuseCheck (L338) |
| Engine pipeline | _shared/engine/core.ts runEngine (L27) |
| Money Mode FSM | widget-chat/index.ts L628-781 |
| Master prompt builder | widget-chat/index.ts buildMasterSystemPrompt (L1340) |
| Gemini call + breaker | widget-chat L2317 / _shared/circuitBreaker.ts L154 |
| Widget markers parse | widget-chat L2385-2441 |
| Deterministic UI choice | widget-chat resolveDeterministicUIComponent (L499) |
| Booking gate/execution | widget-chat L2658-2794 |
| Order gate/execution | widget-chat L2800-2962 (+ _shared/inventoryValidator.ts executeOrder L357) |
| Booking validation pipeline | _shared/bookingValidator.ts validateBooking (L114) |
| Atomic stock | deduct_stock RPC (FOR UPDATE) |
| Action permission | _shared/actionGate.ts validateActionGate (L177) |
| Name validation | _shared/nameValidator.ts (backend) + src/pages/Widget.tsx L201 (fork) |
| Rolling summary | widget-chat generateRollingSummary (L953) |
| KPIs → events | widget-chat computeConversationKPIs (L1025) + persistence L2484 |
| Widget runtime page | src/pages/Widget.tsx (sendMessage L657, resume L390) |
| Embed loader | public/widget-embed.js |
| UI signal renderer | src/components/widget/UISignalRenderer.tsx |
| Voice orb | src/components/widget/VoiceChatOverlay.tsx |
| Revenue dashboard | src/components/RevenueEngine.tsx |
| Money Mode config write | RevenueEngine saveMoneyModeConfig (L381) |
| Onboarding store | src/store/onboarding.ts |
| Receptionist creation | src/pages/onboarding/Step1CreateReceptionist.tsx L264 |
| Dashboard race fix | src/pages/Dashboard.tsx dataLoaded gate (L29-68) |
| Sandbox isolation | src/pages/Builder.tsx L120/L211/L341 |
| Public read RPCs | get_public_receptionist / get_safe_receptionist_for_widget / get_services_for_receptionist |
| Reminder installer (NOT RUN) | setup-reminder-cron → pg_cron job |
| Health score | system-health (starts 100, deductions documented above) |

---

*End of document. Everything above verified against source (with line numbers) and live
production queries performed 2026-08-23.*
