# Booking System QA Plan

## Overview
This document outlines the testing and validation process for the AI-driven appointment booking system in Rutex FrontDesk.

## Architecture Components

### Database Tables
- `appointments` - Main appointment records with status tracking
- `appointment_logs` - Audit trail for all appointment changes
- `appointment_slots` - Cached availability slots (optional optimization)
- `ai_booking_suggestions` - Alternatives suggested by AI with scoring
- `services` - Service definitions with duration and buffers
- `availability_rules` - Weekly recurring availability schedule
- `availability_exceptions` - Holidays and blocked time periods

### Edge Functions
1. **check-availability** - Returns available slots and scored alternatives
2. **book-appointment** - Creates appointments with conflict checking
3. **appointment-action** - Handles confirm/cancel/reschedule operations
4. **appointment-reminder** - Cron job for sending reminders
5. **chat** - AI receptionist with booking intent detection

## Setup Instructions

### 1. Database Migration
Run the migrations to create required tables:
```sql
-- See migrations/000X_create_appointments_and_calendar.sql
-- Run in Supabase SQL Editor or via migration tool
```

### 2. Edge Function Deployment
Functions are auto-deployed on preview builds. Manual deployment:
```bash
# Not needed - Lovable auto-deploys edge functions
```

### 3. Environment Variables
Required secrets (already configured):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LOVABLE_API_KEY`

Optional (for Google Calendar sync):
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

## Testing Procedures

### Automated Smoke Tests
Run the smoke test script after deployment:

```bash
# Make executable
chmod +x scripts/smoke-test-booking.sh

# Run with receptionist ID
./scripts/smoke-test-booking.sh <your-receptionist-id>
```

**Expected Results:**
- ✅ Availability check returns slots or alternatives
- ✅ First booking succeeds with appointment ID
- ✅ Duplicate booking returns 409 conflict
- ✅ Confirm/cancel operations work

### Manual Testing Workflow

#### Test 1: Basic Booking via Chat
1. Navigate to Builder page (`/builder/:id`)
2. Ensure receptionist is saved
3. In chat, type: "I'd like to book an appointment for tomorrow at 2pm"
4. **Expected:** AI extracts intent, checks availability, presents alternatives if needed
5. Click "Book This Time" on an alternative
6. **Expected:** Toast notification confirms booking, appointment appears in database

#### Test 2: Unavailable Slot Handling
1. Book an appointment for a specific time
2. Try to book the same time again
3. **Expected:** System presents alternatives, no double-booking occurs

#### Test 3: Appointment Actions
1. Find an appointment ID from database or booking response
2. Use curl or UI to:
   - Confirm: `POST /appointment-action` with `action: "confirm"`
   - Reschedule: Provide `newStartTime`, `newEndTime`
   - Cancel: Provide optional `reason`
3. **Expected:** Status updates, audit logs created, notifications sent

#### Test 4: Conflict Detection
1. Create appointment at 10:00-10:30
2. Try booking 10:15-10:45 (overlaps)
3. **Expected:** 409 error, conflicting appointment IDs returned

#### Test 5: Alternatives Scoring
1. Request a time that's not available
2. **Expected:** 
   - `alternatives` array with scored options
   - Higher scores for times closer to requested
   - Reason field explains time difference
   - Entry in `ai_booking_suggestions` table

### Edge Cases to Validate

#### Timezone Handling
- [ ] Appointments created in different timezones parse correctly
- [ ] availability_rules respect receptionist timezone
- [ ] UI displays times in user's local timezone

#### Concurrent Bookings
- [ ] Two users booking same slot simultaneously
- [ ] Expected: One succeeds, one gets 409 conflict
- [ ] Use transaction isolation or advisory locks if needed

#### Buffer Times
- [ ] Service buffer_before_minutes prevents back-to-back bookings
- [ ] buffer_after_minutes creates appropriate gaps
- [ ] Buffers considered in conflict detection

#### Invalid Inputs
- [ ] Missing required fields return 400 errors
- [ ] Invalid date formats handled gracefully
- [ ] Non-existent receptionist/service IDs return 404

## Security Checklist

### Row-Level Security (RLS)
- [x] `appointments` table has RLS enabled
- [x] Users can only view their own receptionist's appointments
- [x] `appointment_logs` audit trail protected
- [x] `ai_booking_suggestions` restricted by receptionist ownership

### Data Privacy
- [ ] Customer contact info (email, phone) not exposed in logs
- [ ] Notifications contain only necessary appointment details
- [ ] Analytics data anonymized appropriately

### Authentication
- [ ] Edge functions verify receptionist ownership
- [ ] Public booking endpoints (if any) rate-limited
- [ ] Admin actions require proper authorization

## Observability & Monitoring

### Metrics to Track
- Booking success rate
- Conflict rate (409 responses)
- Alternative acceptance rate
- Average latency for check-availability
- Booking sources (ai, manual, widget, api)

### Logging
All functions log:
- Request parameters (sanitized)
- Conflict detection results
- Booking outcomes
- Error details for debugging

### Audit Trail
Every appointment change logs:
- `appointment_logs` entry with action type
- Actor ID (if available)
- Payload with before/after state
- Timestamp

## Rollback Procedures

### Database Rollback
To revert migration:
```sql
-- Drop new tables
DROP TABLE IF EXISTS public.ai_booking_suggestions CASCADE;
DROP TABLE IF EXISTS public.appointment_slots CASCADE;

-- Existing tables (appointments, appointment_logs) remain
-- No data loss on rollback since these are new tables
```

### Edge Function Rollback
1. Remove function from `supabase/config.toml`
2. Delete function directory
3. Redeploy

## Performance Targets

- **check-availability**: < 500ms for 7-day window
- **book-appointment**: < 200ms (database insert + validations)
- **appointment-action**: < 150ms
- **Alternatives generation**: < 1s for 48 alternatives

## Known Limitations

1. **No Google Calendar Sync** (Phase 1)
   - Google sync disabled by default
   - Requires OAuth setup
   - Planned for Phase 2

2. **Timezone Approximation**
   - Uses receptionist timezone as default
   - Client-side timezone detection needed for accuracy
   - Consider using Luxon/Temporal for production

3. **Caching Strategy**
   - `appointment_slots` table optional
   - Not yet implemented for this phase
   - Can improve performance for high-traffic scenarios

4. **Concurrent Booking Edge Cases**
   - Postgres-level advisory locks recommended for production
   - Current implementation uses SELECT + INSERT (race condition possible)

## Success Criteria

### Must Pass
- ✅ All smoke tests pass
- ✅ No security warnings in linter
- ✅ RLS policies enforced on all tables
- ✅ Audit logs created for all appointment changes
- ✅ Notifications sent on booking/confirm/cancel

### Should Pass
- ⚠️ Alternatives presented with meaningful scores
- ⚠️ Conflict detection catches edge cases
- ⚠️ UI renders alternatives beautifully
- ⚠️ Performance targets met

### Nice to Have
- 🎯 Google Calendar sync working
- 🎯 SMS/Email confirmations sent
- 🎯 Appointment reminders triggered by cron

## Next Steps (Phase 2)

1. **Google Calendar Integration**
   - OAuth flow for calendar access
   - Bidirectional sync (Supabase ↔ Google)
   - Conflict resolution strategy

2. **Notification Channels**
   - SMS via Twilio
   - Email via Resend/SendGrid
   - Push notifications

3. **Advanced Scheduling**
   - Recurring appointments
   - Multi-service bookings
   - Resource/room allocation

4. **Analytics Dashboard**
   - Booking conversion funnel
   - Popular time slots
   - Service utilization

## Support & Debugging

### Common Issues

**Issue:** Alternatives not showing in UI
- **Check:** `chat` function returns `alternatives` array
- **Check:** `check-availability` returns scored alternatives
- **Fix:** Verify desiredStart/desiredEnd passed to availability check

**Issue:** Booking fails with 409 always
- **Check:** Existing appointments overlapping
- **Fix:** Query appointments table, check buffers

**Issue:** No notifications received
- **Check:** `notifications` table has entries
- **Check:** User's receptionist ownership
- **Fix:** Verify notification insert success in function logs

### Debug Commands

```bash
# Check recent appointments
curl -X POST <SUPABASE_URL>/rest/v1/rpc/appointments \
  -H "apikey: <ANON_KEY>"

# View edge function logs
# Use Supabase dashboard → Edge Functions → Logs

# Test notification creation
curl -X POST <SUPABASE_URL>/functions/v1/create-notification \
  -d '{"type":"test","title":"Test"}'
```

## Contact

For issues or questions:
- Review edge function logs in Lovable
- Check `appointment_logs` table for audit trail
- Run smoke tests to isolate component failures

---

**Version:** 1.0  
**Last Updated:** 2025-01-22  
**Maintainer:** Rutex FrontDesk Team
