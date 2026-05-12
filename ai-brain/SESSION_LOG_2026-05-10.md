# Session Log — 2026-05-10

## Status
- Gemini API key still quota-exhausted (free tier). Need billing enabled or daily reset.
- Git identity not set on this machine — cannot commit/push.
- `npm install` fails locally (esbuild).
- Vercel DNS broken on this machine.

## Goal for This Session
Work on remaining audit defects from ROADMAP.md (15 of 17 unfixed).

## Work Completed — M1 Idempotency Fix (5-10h)

### Files Changed

**1. `supabase/migrations/20260510000001_add_idempotency_constraints.sql`** (NEW)
- UNIQUE partial index on `appointments(idempotency_key)` WHERE NOT NULL — hard DB-level dedup
- Added `idempotency_key` column to `orders` table
- Index + UNIQUE partial index on `orders(idempotency_key)` WHERE NOT NULL
- Updated `create_widget_order` RPC with `p_idempotency_key` param — checks before insert, returns existing order ID if found

**2. `supabase/functions/book-appointment/index.ts:`**
- Catches unique violation (23505) gracefully — returns existing record instead of 500

**3. `supabase/functions/_shared/inventoryValidator.ts:`**
- `buildOrderPayload()` — accepts `idempotencyKey` option, includes it in return payload + metadata
- `executeOrder()` — passes `p_idempotency_key` to `create_widget_order` RPC

**4. `supabase/functions/widget-chat/index.ts:`**
- Added `getExistingOrderByIdempotencyKey()` — looks up orders by idempotency_key
- Order flow now generates SHA-256 idempotency key from (sessionId, productIds) before creating
- Key-based pre-check prevents duplicate order creation
- Passes idempotencyKey to `inventoryValidator.executeOrder()`

### What Already Existed (unchanged)
- Booking idempotency checks in widget-chat (session + key-based before `book-appointment` call)
- `book-appointment` idempotency check before insert
- `create_widget_appointment` RPC idempotency check

### What M1 Fix Adds
- **Hard DB guarantee** — UNIQUE constraint catches race conditions app-level checks miss
- **Order idempotency** — same SHA-256 key generation + check pattern as bookings, now applied to orders
- **Graceful error handling** — unique violation returns existing record, not 500

### Not Deployed
- Cannot apply migration (no Supabase CLI access / DB admin on this machine)
- Cannot deploy edge function changes (git identity not set, `npx supabase functions deploy` may have DNS issues)
- These changes need to be deployed when environment is available

## Defect Summary (Remaining — 14 unfixed)
| ID | Severity | Description | Effort | Phase |
|----|----------|-------------|--------|-------|
| C1 | CRITICAL | Dual AI engines never coordinated | 40-60h | 1 |
| C3 | CRITICAL | 7+ prompt sources contradictory | 20-30h | 1 |
| C4 | CRITICAL | 6 overlapping state systems | 20-30h | 2 |
| C5 | CRITICAL | Dual UI signal systems racing | 10-15h | 4 |
| C6 | HIGH | Product/service confusion | 5-10h | 5 |
| C7 | HIGH | Naive memory truncation loses slots | 10-15h | 2 |
| A1 | HIGH | bookingValidator.ts exists but unused | 10-15h | 7 |
| A2 | HIGH | Dead code never wired into pipeline | 5-10h | 1 |
| A3 | MEDIUM | Mixed error handling patterns | 5-10h | — |
| A4 | MEDIUM | UI component name inconsistency | 3-5h | 4 |
| M2 | MEDIUM | No FAQ response caching | 5-10h | 9 |
| M4 | HIGH | No AI failure fallback | 5-10h | 9 |
| M5 | MEDIUM | KPIs computed but never written | 5-10h | 9 |
| R2 | HIGH | Money Mode scoring never effective | 10-15h | 6 |
