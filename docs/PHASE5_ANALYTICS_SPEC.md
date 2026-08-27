# Phase 5 — Owner-Facing Analytics: No-Show Rate, Service/Product Breakdown, Weekly View

## What Exists
- `analytics` edge function computes 6 metric blocks (conversation, AI quality, business, revenue, conversion funnel, performance)
- `Analytics.tsx` renders stat cards, charts (conversation trend, quality, match rates, revenue over time, funnel), receptionist breakdown table
- Appointments have `status`: `"booked" | "cancelled" | "completed"`
- Orders have `status` and `order_items` with `product_name`

## What's Missing (Phase 5 gaps)
1. **No-show / cancellation rate** — not computed anywhere
2. **Most-booked services** — appointments grouped by `service` name with counts
3. **Most-ordered products** — orders grouped by `product_name` from `order_items`
4. **"This Week" preset** — only Last 7/30/90 days exist

## Changes

### Backend (`analytics/index.ts`)
Add to the `compute` action:
- `business_metrics.no_show_rate` = `cancelled / total appointments` (where total = booked + cancelled + completed)
- `business_metrics.cancellation_rate` = alias for clarity
- `business_metrics.service_breakdown` = `Array<{ service: string; count: number }>` sorted desc by count
- `business_metrics.product_breakdown` = `Array<{ product: string; count: number; revenue: number }>` sorted desc by count

Query additions:
- Appointments: already fetched — add `service` to select (already present)
- Orders: need to join `order_items` for `product_name`

### Frontend (`Analytics.tsx`)
- Add "This Week" preset (days: 7, label: "This Week")
- Add no-show rate to `StatCard` row
- Add service breakdown bar chart
- Add product breakdown table

### Tests (`tests/analyticsPhase5.test.ts`)
- No-show rate calculation
- Service breakdown grouping
- Product breakdown grouping
- "This Week" preset
