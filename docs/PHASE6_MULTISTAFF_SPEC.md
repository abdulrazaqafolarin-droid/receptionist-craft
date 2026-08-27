# Phase 6 — Multi-Staff / Multi-Location Support

## Current State
- One `receptionists` record = one business
- `availability_rules` has `receptionist_id` — one calendar per business
- `appointments` has `receptionist_id` — no staff assignment
- No `staff` table exists

## What Phase 6 Adds
1. `staff` table — individual team members under a receptionist
2. `staff_id` FK on `availability_rules` — staff-specific schedules
3. `staff_id` FK on `appointments` — assignment to specific staff
4. Staff management UI page
5. Availability page filtered by staff member
6. Booking flow assigns staff based on availability

## Schema

### staff table
```sql
CREATE TABLE public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Alterations
- `availability_rules.staff_id` — nullable UUID FK to staff
- `appointments.staff_id` — nullable UUID FK to staff
- Unique index: `(receptionist_id, staff_id, day_of_week)` where staff_id IS NOT NULL
