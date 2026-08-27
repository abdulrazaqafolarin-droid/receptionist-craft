# PHASES 4-8 AUDIT FINDINGS — Save for Later Fix Session

## Date: 2026-08-26

### What Was Built (Phases 4-8)
All 8 phases implemented: 4 SQL migrations, 5 new frontend pages, 5 new test files,
3 shared edge function modules, widget-chat integration, analytics enhancement.
149 tests pass, 0 TS errors.

### Bugs Found & Fixed During Audit

#### 1. `recordVisit()` was broken (resolveCustomer.ts)
- **Problem:** Called non-existent RPC `increment_customer_visit`. Fallback was dead code
  (`visit_count: supabase.rpc ? undefined : undefined` — always undefined).
- **Fix:** Removed `recordVisit()` entirely. Kept `bumpVisitCount()` which does read-then-write.

#### 2. `bumpVisitCount()` was never called
- **Problem:** Function existed but wasn't wired into any success path in widget-chat.
- **Fix:** Added `await import("../_shared/customers/resolveCustomer.ts")` + `bumpVisitCount(supabase, customerId)`
  after BOTH successful booking (line ~2885) AND successful order (line ~3035) in widget-chat/index.ts.

#### 3. Escalation detection only logged, didn't persist
- **Problem:** `checkEscalationNeeded()` existed in widget-chat but only did `console.log`.
- **Fix:** Added `supabase.from("escalations").insert(...)` block after the escalation check in widget-chat.

### Gaps Still To Fix (Not Blocking Plan Completion)

#### GAP 1: Billing has no real payment processor
- Upgrade flow writes directly to DB (no Stripe/Paystack checkout redirect).
- Works for testing, not for real payments.
- **Fix needed:** Wire to existing `_shared/payments/stripe.ts` or `paystack.ts` for subscription checkout.

#### GAP 2: Plan limits not enforced at API level
- `checkPlanLimit()` exists in tests but no edge function guard on receptionist/customer creation.
- Anyone can create unlimited resources.
- **Fix needed:** Add plan limit check to `onboard-configurator` and customer creation paths.

#### GAP 3: Staff not wired into booking flow
- `findAvailableStaff()` exists as utility but widget-chat doesn't use it when booking.
- **Fix needed:** Before booking, check available staff and assign `staff_id` to appointment.

#### GAP 4: Escalation response is one-way
- Owner can mark "resolved" but can't message the customer back through the escalation.
- **Fix needed:** Add response field to escalation, or link to Conversations page.

#### GAP 5: Migrations not applied to live DB
- 4 migration files exist but haven't been deployed to Supabase.
- **Fix needed:** Apply via Supabase Management API or `npx supabase db push`.

### Files Created This Session
```
supabase/migrations/20260826000003_add_customers_table.sql
supabase/migrations/20260826000004_add_staff_table.sql
supabase/migrations/20260826000005_add_escalations_table.sql
supabase/migrations/20260826000006_add_subscriptions_table.sql
supabase/functions/_shared/customers/resolveCustomer.ts
supabase/functions/_shared/customers/getCustomerHistory.ts
supabase/functions/_shared/customers/index.ts
supabase/functions/_shared/staff/index.ts
src/pages/Customers.tsx
src/pages/Staff.tsx
src/pages/Escalations.tsx
src/pages/Billing.tsx
tests/customerMemory.test.ts
tests/analyticsPhase5.test.ts
tests/multiStaff.test.ts
tests/escalation.test.ts
tests/billing.test.ts
docs/PHASE4_CUSTOMER_MEMORY_SPEC.md
docs/PHASE5_ANALYTICS_SPEC.md
docs/PHASE6_MULTISTAFF_SPEC.md
docs/PHASE7_ESCALATION_SPEC.md
docs/PHASE8_BILLING_SPEC.md
```

### Files Modified This Session
```
supabase/functions/widget-chat/index.ts (customer resolution + bumpVisitCount + escalation persist)
supabase/functions/analytics/index.ts (service/product breakdown, no-show rate)
src/App.tsx (4 new routes + imports)
src/components/AppSidebar.tsx (4 new nav items + icons)
```
