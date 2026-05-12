# AGENTS.md — RUTEX PLATFORM

## The Definitive Technical Handover for All AI Agents

### Last Updated: April 2026 | Author: Claude (Anthropic) + Rutex Founder

---

## PART 0 — WHAT THIS PLATFORM ACTUALLY IS

**Rutex is a Conversational Revenue Infrastructure.**

Not a chatbot. Not a booking tool. Not a support widget.
It is a system that sits between any business and its customers and
converts every conversation into a measurable economic event —
a booking, a sale, a lead, a follow-up, a retention signal.

---

## PART 1 — PLATFORM IDENTITY

```
Product Name:     Rutex
Tagline:          We don't sell AI. We sell money systems powered by AI.
Repo:             github.com/abdulrazaqafolarin-droid/receptionist-craft
Live URL:         receptionist-craft.vercel.app
Stack:            React 18 + Vite 5 + TypeScript 5 + Tailwind v3 + shadcn/ui
Backend:          Supabase (PostgreSQL + Deno Edge Functions)
AI Engine:        Google Gemini 1.5 Flash (DIRECT API)
Deployment:       Vercel (frontend) + Supabase Edge Functions (backend)
Dev Environment:  Phone-only (Android + Termux) — no laptop access
```

---

## PART 2 — SUPABASE PROJECT (OWNED)

```
Project Ref:      esvrhnlwquunsdduvbnr
Project URL:      https://esvrhnlwquunsdduvbnr.supabase.co
Anon Key:         sb_publishable_jbVlP7sXJ3TmGM-njwZ2Jw_KN2yUEt1
Region:           eu-west-2
DB Pooler Host:   aws-1-eu-west-2.pooler.supabase.com (IPv4 compatible)
DB Pooler Port:   5432
DB User:          postgres.esvrhnlwquunsdduvbnr
```

**CRITICAL:** Old project `mlbsgkkkvaiggxkbtewi` is OBSOLETE. Use `esvrhnlwquunsdduvbnr` only.

---

## PART 3 — SECRETS (SET IN SUPABASE DASHBOARD)

```
✅ GEMINI_API_KEY              — Direct Gemini 1.5 Flash API key
✅ SUPABASE_SERVICE_ROLE_KEY   — Service role for edge function DB access
⚠️ RESEND_API_KEY              — Email confirmations
⚠️ ELEVENLABS_API_KEY          — Voice TTS
⚠️ ASSEMBLYAI_API_KEY          — Voice STT
❌ LOVABLE_API_KEY             — OBSOLETE. Never use.
```

---

## PART 4 — AI GATEWAY (ALL FUNCTIONAL)

All 6 functions migrated to direct Gemini API — all deployed and operational:
- `generate-system-prompt` ✅
- `generate-knowledge-base` ✅
- `parse-services` ✅ (uses JSON mode)
- `kb-rewrite` ✅
- `widget-chat` ✅ (FIXED: secret name mismatch + deprecated model)
- `chat` ✅ (model updated)

### Critical Fixes Applied (2026-05-10)
1. **Secret name**: Was `Gemini Api` → corrected to `GEMINI_API_KEY`
2. **Model**: `gemini-1.5-flash` deprecated → migrated to `gemini-2.5-flash-lite` (verified working with test call)
3. **All 6 edge functions redeployed** with updated model references

### Gemini API Call Pattern
```typescript
POST `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`
{
  contents: [{ parts: [{ text: fullPrompt }] }],
  generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
}
```

---

## PART 5 — DATABASE

35 tables, 6 enums, 106 RLS policies. Full schema in `supabase_full_export.sql`.

### Key Tables
- `receptionists` — Central tenant config
- `services` — Products + services unified
- `appointments` — Booking core
- `availability_rules` — Schedule source of truth
- `orders` + `order_items` — Commerce fulfillment
- `chat_messages` — Verbatim history
- `conversation_state` — Engine state per session
- `conversation_summaries` — Rolling memory summary
- `conversion_events` — Revenue funnel events

### Critical Trigger (MUST EXIST)
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, plan, onboarding_completed)
  VALUES (new.id, new.email,
    COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'free', false)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

## PART 6 — ARCHITECTURE PATTERNS

### 6.1 The 7-Layer Prompt System
Location: `supabase/functions/_shared/layers/`
1. Identity — Who is this receptionist
2. Knowledge — Business facts, services, prices, FAQs
3. Memory — Conversation history, captured slots
4. Intent — Buyer readiness, intent classification
5. Booking — Service selection, slot collection, confirmation
6. Safety — Guardrails, hallucination prevention
7. Failure — Graceful degradation, escalation

### 6.2 Unified Engine v2
Location: `supabase/functions/_shared/engine/`
`runEngine()` is the single entry point.

### 6.3 Money Mode
Field: `receptionists.money_mode_enabled` (boolean)
Current: Manual toggle only. Target: Intent scoring 1-10 auto-trigger.

### 6.4 Critical Rules (NEVER BREAK)
- Greet ONLY ONCE per session
- "I'm sorry to hear that" — max once per session
- Name validator — rejects greetings, pronouns, sentences, profanity
- Hallucination guard — prices/hours/stock must come from DB
- Action gate — booking/order tools blocked until all slots filled + confirmed
- 24h session restoration
- Reminder cron — re-invoke after fresh DB setup

---

## PART 7 — NAMING CONVENTIONS
```
Edge functions:     kebab-case folders   (widget-chat, kb-rewrite)
Shared modules:     camelCase files      (bookingValidator.ts)
React components:   PascalCase           (RevenueEngine.tsx)
DB tables:          snake_case plural    (receptionists, chat_messages)
RPCs:               snake_case verb-first (create_widget_appointment)
```

---

## PART 8 — RESOLVED BLOCKERS

### widget-chat Boot Error — RESOLVED (2026-05-10)

The function had two issues that were NOT a boot error:
1. **Secret name mismatch**: Supabase secret was stored as `Gemini Api` instead of `GEMINI_API_KEY`. Code's fallback chain (`GEMINI_API_KEY` → `GOOGLE_API_KEY` → `AI_API_KEY`) couldn't find the key. **Fix**: Created `GEMINI_API_KEY` secret with correct value.
2. **Deprecated model**: `gemini-1.5-flash` was removed by Google. Used `gemini-2.5-flash-lite` instead (verified working). **Fix**: Updated model references in all 6 edge functions and redeployed.

### Vercel Deployment — OPERATIONAL
Custom domain `receptionist-craft.vercel.app` returns 200 OK with latest build.

---

## PART 9 — FEATURE ROADMAP
1. Fix widget-chat boot error (IMMEDIATE)
2. Money Mode intelligence upgrade (dynamic intent scoring)
3. MEO analytics dashboard
4. Payment integration (Paystack + Stripe)
5. Live case study (Tess dental clinic)
6. Ecosystem expansion (dropshipping, agencies, creators)

---

## PART 9 — FEATURE ROADMAP
1. Fix widget-chat boot error (IMMEDIATE)
2. Money Mode intelligence upgrade (dynamic intent scoring)
3. MEO analytics dashboard
4. Payment integration (Paystack + Stripe)
5. Live case study (Tess dental clinic)
6. Ecosystem expansion (dropshipping, agencies, creators)

---

## PART 10 — SESSION LOG (2026-05-10) — Widget Chat Diagnostic & Fixes

### Problem
Widget replied "I'm experiencing a temporary issue. Please try again in a moment."

### Root Causes Found & Fixed

#### 1. verify_jwt blocking requests (✔ FIXED)
- `widget-chat` and `chat` had `verify_jwt: true` (default)
- The Supabase anon key is NOT a valid JWT — `supabase.functions.invoke()` from frontend passes anon key as Bearer token
- **Fix:** Set `verify_jwt = false` via Management API PATCH:
  ```powershell
  PATCH /v1/projects/esvrhnlwquunsdduvbnr/functions/{slug}
  body: { "verify_jwt": false }
  ```
- Also updated `supabase/config.toml` so future `npx supabase functions deploy` preserves this.

#### 2. Missing `.contains()` in custom db.ts (✔ FIXED)
- `widget-chat` uses custom `_shared/db.ts` (fetch-based Supabase REST client)
- Original `SelectQuery` only had `.eq()`, `.order()`, `.limit()`, `.maybeSingle()`, `.single()`
- `getExistingBookingForSession()`, `getExistingBookingByIdempotencyKey()`, `getExistingOrderForSession()` all call `.contains("metadata", {...})` — which was undefined → runtime error
- **Fix:** Added `.contains(col, val)` method using `cs` (contains) operator for JSONB
- Deployed as widget-chat v23

#### 3. Gemini API Free Tier Quota Exhausted (🔴 STILL BROKEN)
- API key `AIzaSyDGJTWoGOEyoMepwI0rLgvLNe3ZP3Gt-xA` is valid but on free tier
- Limits: 20 requests/day for gemini-2.5-flash-lite (all consumed)
- Per-minute and per-day quotas also exhausted for gemini-2.0-flash
- **Fix needed:** Enable billing in Google AI Studio for this key, or wait ~24h for daily reset
- Added `_diagnostic` field in catch block response to surface Gemini errors to frontend (widget-chat v24)

### Supabase Management Commands Used

```powershell
# List functions
GET /v1/projects/esvrhnlwquunsdduvbnr/functions

# Update verify_jwt
PATCH /v1/projects/esvrhnlwquunsdduvbnr/functions/{slug}
body: { "verify_jwt": false }

# Deploy function (from local)
npx supabase functions deploy {slug} --project-ref esvrhnlwquunsdduvbnr
```

### Secrets (actual values)
- `GEMINI_API_KEY` = `AIzaSyDGJTWoGOEyoMepwI0rLgvLNe3ZP3Gt-xA`
- `SUPABASE_SERVICE_ROLE_KEY` (JWT) = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzdnJobmx3cXV1bnNkZHV2Ym5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTUxMzkzOCwiZXhwIjoyMDkxMDg5OTM4fQ.zRc_SlrPbLO85hWX9dbqVc4yDrbONJvqY4NAgR7ey7s`

### Active Receptionist for Testing
- **Name:** Ruth
- **Business:** Rutex Demo Clinic
- **ID:** `8009284e-4dc2-4530-ba25-0e1c90a445ac`

### Widget Chat v24 — Current State
- `verify_jwt: false` ✓
- `.contains()` fixed ✓
- Gemini error diagnostics returned as `_diagnostic` in response ✓
- Gemini API still broken (quota exhausted on free tier)

---

## PART 11 — DEV ENVIRONMENT
- Device: Android phone only (Termux)
- DNS: IPv6 broken — use pooler URLs
- Supabase CLI: DNS issues on Android — use curl/Python
- Git auth: Token in URL
- Python 3.13 available
- Deno 2.7.12 installed

---

## PART 11 — FILES NEVER TO EDIT
- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/types.ts`
- `.env`
- `supabase/migrations/*` (only add new)

---

## PART 12 — FIXES APPLIED (2026-05-12)

### M1 — Booking/Order Idempotency
- UNIQUE partial index on `appointments(idempotency_key)` — hard DB dedup
- Added `idempotency_key` column to `orders` table + UNIQUE index
- Updated `create_widget_order` RPC with `p_idempotency_key` param
- `book-appointment` now catches unique violation (23505) gracefully → returns existing record
- `widget-chat` generates SHA-256 idempotency key for orders from (sessionId, productIds)
- `inventoryValidator` passes `p_idempotency_key` through to RPC

### C6 — Product/Service Confusion
- `widget-chat` now passes `services` to `resolveCapabilities()` — was falling to defaults
- Removed `||` operator in capability derivation — priority 2 now returns pure DB values
- Corrected 7 business type defaults in `DEFAULT_CAPABILITY_MAPPINGS`

### A4 — UI Component Naming
- Added `"switch_confirmation"` to edge function's `UIComponent` type

### A1 — Validator Layer
- Created `_shared/bookingPreValidator.ts` — lightweight sync pre-validation
- Added inline pre-check diagnostics to widget-chat booking flow

### C4 — UI Widget Suppression [2026-05-12]
- Root cause: `userSentTextInsteadOfWidget` check at L2926 was `true` for every normal text message, suppressing `intentSuggestedComponent` (flow-step widgets: service_selector, date_picker, time_picker, product_selector)
- Fix: Removed `userSentTextInsteadOfWidget` from the suppression condition at L2935
- Committed as `73652df`, deployed as widget-chat v26

### PHASE 1 — Dual Engine Consolidation [2026-05-12]
- Confirmed no inline `.ts` files in `widget-chat/` (all logic in single `index.ts`)
- **Deleted 3 dead files from `_shared/flow/`:**
  - `conversationGovernor.ts` — not imported anywhere
  - `unifiedCore.ts` — widget-chat imported types only, never used in code
  - `memoryPipeline.ts` — widget-chat imported types only, never used in code
- Removed dead type-only imports from `widget-chat/index.ts` (lines 79-89)
- Remaining `_shared/flow/` files still actively used: `types.ts`, `stateManager.ts`, `flowRouter.ts`, `slotExtractor.ts`, `memorySummarizer.ts`, `taskIntelligence.ts`
- Committed as `d86da78`, deployed as widget-chat v27

## PART 13 — SESSION LOG (2026-05-12)

### Applied to Production
1. **SQL Migration** — Applied via Management API `/database/query`:
   - `idx_appointments_idempotency_unique` (UNIQUE partial index on appointments)
   - `idempotency_key` column added to orders
   - `idx_orders_idempotency` (non-unique index for fast lookups)
   - `idx_orders_idempotency_unique` (UNIQUE partial index on orders)
   - `create_widget_order` RPC updated with `p_idempotency_key` parameter (8-arg version)
   - Cleaned up: dropped old `idx_appointments_idempotency` (non-unique leftover), dropped old 7-arg RPC overload
2. **Edge function deploys** — Redeployed via Supabase CLI: `widget-chat` (v26) and `book-appointment`
3. **UI fix (C4)** — Removed `userSentTextInsteadOfWidget` suppression of flow-step widgets, committed + pushed as `73652df`

### Notes
- `CREATE UNIQUE INDEX CONCURRENTLY` had to be changed to `CREATE UNIQUE INDEX` (Management API wraps queries in transactions, preventing CONCURRENTLY)
- Large SQL payloads timeout at 60s via Management API — break into single-statement calls
- `npx supabase functions deploy` works with `powershell -ExecutionPolicy Bypass`

### PHASE 1 deployed
4. **Dead code removal** — Deleted 3 files, removed dead type imports, committed as `d86da78`, deployed as widget-chat v27

### C7 — Memory Truncation (HIGH)
- Enhanced `generateRollingSummary()` with smart truncation that preserves: first greeting exchange, all captured customer info (name, phone, email), booking details (service, date, time), order details (products, qty), booking/order confirmation status, emotional state
- Passes already-computed `conversationContext` instead of re-extracting from partial history
- Committed as `69581eb`, deployed as widget-chat v28

## PART 14 — SESSION LOG (2026-05-12)

### Applied to Production (round 2)
1. **C7 — Memory truncation** — Smart `generateRollingSummary()` deployed as widget-chat v28
2. **PHASE 1** — 3 dead flow files deleted, deployed as widget-chat v27
3. **C4 — UI suppression** — Removed `userSentTextInsteadOfWidget`, deployed as widget-chat v26

### Audit Status
- **Fixed (9 of 17):** C2/R1, M1, C6, A4, A1, C4, C7, verify_jwt, .contains() + PHASE 1 dead code (A2)
- **Reclassified (2):** C5 (doc-only), A2 partially (dead code removed in PHASE 1)
- **Remaining (7):** C1 (dual engines), C3 (prompt contradictions), A3 (error handling), M2 (caching), M4 (AI fallback), M5 (KPIs), R2 (Money Mode)

## PART 15 — ENGINEERING PRINCIPLE (copied from Part 14)
Every change must answer YES to:
> Does this increase revenue conversion for the business owner?
> OR reduce the risk of the platform failing them?
If NO — reject the change.
