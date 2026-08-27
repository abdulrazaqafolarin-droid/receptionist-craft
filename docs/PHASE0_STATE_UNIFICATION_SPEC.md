# PHASE 0.3 SPEC — Unifying Booking/Order Execution Into the Server-Side Path

> Status: APPROVED-FOR-IMPLEMENTATION | Date: 2026-08-25
> Problem class: live double-booking risk (P0.3 in operator prompt)

---

## 1. Problem statement

Two independent code paths can currently create real bookings and orders:

| Path | Where | Idempotency | Gates | State source |
|---|---|---|---|---|
| **A (client)** | `src/pages/Widget.tsx` — `collectingInfo==='contact'` branch calls `create_widget_order` RPC / `book-appointment` directly from the browser | **NONE** (client sends no idempotency key) | Local regex only; no availability validation for orders, no server gate | `bookingState` (React + localStorage) |
| **B (server)** | `widget-chat` edge function — gated execution with SHA-256 idempotency keys, execution locks, explicit-confirm requirement, actionGate requirements | SHA-256(session::service::date::time) | Full: confirm intent + flow stage + lock + gate.allowed | Engine v2 slots (DB) |

The client also sends `bookingContext` on every message — the backend reads it
**zero times** (grep-verified). Two controllers, no shared truth. A retry,
double-click, or race between paths can double-book; only a ±15-minute
contact-heuristic in `book-appointment` stands in the way.

## 2. Decision (deliberate, per operator-prompt recommendation)

**Remove Path A entirely. All transactional execution goes through widget-chat's
gated server-side path.** Rationale:
- Path B already has everything Path A lacks: idempotency, locks, confirmation
  gates, hallucination-guarded messaging, analytics events.
- One controller = one set of guarantees. Client keeps *presentation* duties.

## 3. What changes

### 3.1 Widget.tsx — REMOVED (execution authority)
- The entire `collectingInfo === 'name'` interception branch (local name
  validation, local acks).
- The entire `collectingInfo === 'contact'` branch (both the direct
  `create_widget_order` RPC call and the direct `book-appointment` invoke).
- The `awaitingOrderConfirmation` intercept branch (confirm/change/cancel
  regexes that short-circuit the AI).
- The dead `bookingContext` field from both `widget-chat` invocations.
- Direct order/booking execution code and its imports.

### 3.2 Widget.tsx — KEPT (pure presentation/read-only)
- Service/date/time/product selector widgets (UISignalRenderer path).
- **Read-only** `check-availability` fetches for populating time pickers
  (read-only queries cannot create inconsistency).
- Session management, greeting storage, resume overlay, quick replies, voice.
- Synthetic user messages ("I'd like to book X", "I'll take the 2pm slot") —
  they are how widget selections feed the server-side engine extractors.

### 3.3 Widget.tsx — CHANGED (route through AI)
- `handleProductsConfirm(cart)` → sends one structured message to widget-chat:
  `"I'd like to order: 2x <Product A>, 1x <Product B>"` instead of storing an
  awaiting-confirmation cart locally.
- Time-slot select → sends `"I'll take the <time> slot on <date>"` to
  widget-chat instead of entering local name collection.
- `onLeadFormSubmit({name,email,phone})` → sends
  `"My name is <n>. Email: <e>. Phone: <p>."` to widget-chat so the server-side
  name validator + slot extraction own capture.
- Input placeholders driven by engine `expectedInput` when present (fallback
  generic placeholder).

### 3.4 Server side
No behavioral changes required — Path B is already complete. This refactor
*removes* its only competitor.

## 4. Why this preserves UX

Every removed client behavior has a server equivalent that was already live:
soft cart confirmation → engine `confirm` step (S2 rule: summarize once);
name/contact acks → governor one-field-at-a-time prompts; validation errors →
engine checkRequirements format validation. The user still taps widgets;
selections still become messages; only *who executes* changes.

## 5. Test plan (must pass before phase close)

1. **Typecheck**: `npm run typecheck` clean.
2. **Unit tests (new vitest setup)** for extracted pure helpers:
   - `buildCartMessage(cart)` formatting incl. pluralization + price omission.
   - `buildLeadFormMessage(data)` field assembly + empty-skip logic.
   - Regression guard: source must NOT contain `create_widget_order`,
     `book-appointment`, or `collectingInfo === 'contact'` (dead-path tripwire).
3. **Manual E2E checklist** (documented): service→date→time→lead-form→AI
   confirms booking via backend flags; product cart → AI collects → order via
   backend flags; refresh mid-flow resumes without executing.

## 6. Explicit non-goals

- No changes to widget-chat prompt/gates in this phase.
- No removal of localStorage booking state yet (still used by resume overlay
  UX); it becomes purely cosmetic. Follow-up cleanup can delete it once
  cross-visit memory (Phase 4) supersedes resume.
