# Appointment Booking System - QA & Testing Guide

## Overview
This guide covers comprehensive testing, troubleshooting, and rollback procedures for the appointment booking system.

---

## Quick Test Checklist

### 1. Edge Function Tests
- [ ] `check-availability` returns sorted slots
- [ ] `book-appointment` creates appointments with tokens
- [ ] `book-appointment` prevents duplicate bookings (idempotency)
- [ ] `book-appointment` detects conflicts
- [ ] `appointment-action` confirms appointments
- [ ] `appointment-action` cancels appointments
- [ ] `chat` extracts booking slots correctly
- [ ] `chat` offers alternatives when unavailable

### 2. Frontend Tests
- [ ] Create Appointment modal validates fields
- [ ] Create Appointment checks availability
- [ ] Appointments page displays all bookings
- [ ] Builder displays alternative slots
- [ ] Confirm page loads with token
- [ ] Cancel page loads with token

### 3. Database Tests
- [ ] Appointments table has new columns
- [ ] appointment_logs table exists
- [ ] Indexes created on appointments
- [ ] RLS policies work correctly

---

## Manual Testing Flows

### Flow 1: Complete Booking via Chat

**Setup:**
1. Open Builder page with active receptionist
2. Clear chat history (optional)

**Steps:**
```
1. User: "I need to book a dental cleaning for tomorrow at 2pm"
2. AI should extract: service, date, time
3. AI checks availability via check-availability
4. If available → books via book-appointment
5. If not → offers 3 alternatives
6. User: "accept_alternative:1"
7. AI books the alternative slot
```

**Expected:**
- Appointment created in DB
- notification sent to owner
- appointment_log entry created
- confirmation message with ID
- tokens stored in metadata

---

### Flow 2: Create Appointment Manually

**Steps:**
1. Go to Appointments page
2. Click "Create Appointment"
3. Fill form:
   - Select receptionist
   - Select service
   - Pick date & time
   - Enter customer info (name + email/phone)
4. Submit

**Expected:**
- Validation before submit
- check-availability called
- book-appointment creates entry
- Success toast appears
- Calendar updates

---

### Flow 3: Public Confirm/Cancel

**Setup:**
1. Create appointment (get tokens from DB)

**Confirm Test:**
```
URL: /confirm-appointment?token={confirmation_token}
1. Page loads appointment details
2. Click "Confirm Appointment"
3. Status changes to "confirmed"
4. appointment_log entry created
5. notification sent
```

**Cancel Test:**
```
URL: /cancel-appointment?token={cancellation_token}
1. Page loads appointment details
2. Enter cancellation reason (optional)
3. Click "Cancel Appointment"
4. Status changes to "cancelled"
5. appointment_log entry created
6. notification sent
```

---

## cURL Test Commands

### Check Availability
```bash
curl -X POST https://xhihzexkqezhpwsryxqv.supabase.co/functions/v1/check-availability \
  -H "Authorization: Bearer {ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "receptionist_id": "{RECEPTIONIST_ID}",
    "startDate": "2025-01-10",
    "endDate": "2025-01-10",
    "maxSlots": 5
  }'
```

### Book Appointment
```bash
curl -X POST https://xhihzexkqezhpwsryxqv.supabase.co/functions/v1/book-appointment \
  -H "Authorization: Bearer {ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "receptionistId": "{RECEPTIONIST_ID}",
    "serviceId": "{SERVICE_ID}",
    "startTime": "2025-01-10T14:00:00Z",
    "customerName": "Test User",
    "customerEmail": "test@example.com",
    "customerPhone": "+1234567890",
    "bookingSource": "manual"
  }'
```

### Confirm Appointment
```bash
curl -X POST https://xhihzexkqezhpwsryxqv.supabase.co/functions/v1/appointment-action \
  -H "Authorization: Bearer {ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "confirm",
    "appointment_id": "{APPOINTMENT_ID}",
    "token": "{CONFIRMATION_TOKEN}"
  }'
```

### Cancel Appointment
```bash
curl -X POST https://xhihzexkqezhpwsryxqv.supabase.co/functions/v1/appointment-action \
  -H "Authorization: Bearer {ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "cancel",
    "appointment_id": "{APPOINTMENT_ID}",
    "token": "{CANCELLATION_TOKEN}",
    "reason": "Testing cancellation"
  }'
```

---

## SQL Verification Queries

### Check Appointment Details
```sql
SELECT 
  id,
  customer_name,
  customer_email,
  customer_phone,
  start_time,
  end_time,
  status,
  booking_source,
  idempotency_key,
  cancellation_token,
  confirmation_token,
  metadata
FROM appointments
WHERE id = '{APPOINTMENT_ID}';
```

### Check Audit Logs
```sql
SELECT 
  action,
  actor_id,
  payload,
  created_at
FROM appointment_logs
WHERE appointment_id = '{APPOINTMENT_ID}'
ORDER BY created_at DESC;
```

### Check Notifications
```sql
SELECT 
  type,
  title,
  body,
  severity,
  created_at
FROM notifications
WHERE metadata->>'appointment_id' = '{APPOINTMENT_ID}'
ORDER BY created_at DESC;
```

### Find Duplicate Bookings (Test Idempotency)
```sql
SELECT 
  customer_email,
  customer_phone,
  start_time,
  COUNT(*) as booking_count
FROM appointments
WHERE status != 'cancelled'
GROUP BY customer_email, customer_phone, start_time
HAVING COUNT(*) > 1;
```

---

## Troubleshooting Guide

### Issue: Booking fails with "Contact required"
**Cause:** Neither email nor phone provided  
**Fix:** Ensure at least one contact method is provided

### Issue: Conflict detected when no appointment exists
**Cause:** Buffer times overlapping or timezone mismatch  
**Fix:** Check service buffer_before/buffer_after and receptionist timezone

### Issue: Alternatives not showing in chat
**Cause:** check-availability not returning alternatives  
**Fix:** Verify check-availability response has `alternatives` array

### Issue: Token invalid on confirm/cancel page
**Cause:** Token not stored in metadata or incorrect format  
**Fix:** Check appointments.metadata.confirmation_token and cancellation_token

### Issue: No notifications sent
**Cause:** Receptionist user_id not found or RLS blocking insert  
**Fix:** Check receptionists table and notifications RLS policies

### Issue: Duplicate bookings created
**Cause:** Idempotency key not passed or duplicate check failing  
**Fix:** Verify idempotency_key is included and unique per request

---

## Rollback SQL (Emergency)

### Remove New Columns
```sql
-- WARNING: This will delete data in these columns!
ALTER TABLE appointments DROP COLUMN IF EXISTS customer_email;
ALTER TABLE appointments DROP COLUMN IF EXISTS customer_phone;
ALTER TABLE appointments DROP COLUMN IF EXISTS idempotency_key;
ALTER TABLE appointments DROP COLUMN IF EXISTS cancellation_token;
ALTER TABLE appointments DROP COLUMN IF EXISTS confirmation_token;
```

### Remove Indexes
```sql
DROP INDEX IF EXISTS idx_appointments_start_time;
DROP INDEX IF EXISTS idx_appointments_status;
DROP INDEX IF EXISTS idx_appointments_idempotency;
```

### Remove appointment_logs Table
```sql
-- WARNING: This will delete all audit logs!
DROP TABLE IF EXISTS appointment_logs CASCADE;
```

### Restore Original appointment-action
```sql
-- Use Git to restore:
-- git checkout HEAD~1 supabase/functions/appointment-action/index.ts
```

---

## Performance Benchmarks

**Expected latencies (95th percentile):**
- check-availability: < 500ms
- book-appointment: < 800ms
- appointment-action: < 400ms
- chat (booking flow): < 2000ms

**Database query performance:**
- Appointment lookups: < 50ms (with indexes)
- Conflict detection: < 100ms
- Idempotency check: < 50ms

---

## Security Checklist

- [ ] Tokens are UUIDs (not sequential IDs)
- [ ] Tokens stored in JSONB metadata (not exposed in API)
- [ ] RLS policies prevent unauthorized access
- [ ] Contact info validated before booking
- [ ] appointment_logs captures all actions
- [ ] Rate limiting enabled on edge functions
- [ ] CORS headers configured correctly

---

## Known Limitations

1. **No email/SMS confirmations yet** - Tokens generated but not sent
2. **No recurring appointments** - Each booking is one-time
3. **No capacity limits** - Parallel bookings can exceed capacity
4. **No waitlist** - When no slots available, only alternatives shown
5. **No timezone picker in modal** - Uses receptionist's default timezone

---

## Next Steps for Production

1. Integrate email service (Resend/SendGrid) for confirmations
2. Add SMS reminders (Twilio)
3. Implement capacity management per service
4. Add appointment rescheduling UI
5. Create customer portal for managing bookings
6. Add calendar export (iCal/Google Calendar)
7. Implement recurring appointments
8. Add payment processing for deposits

---

## Support & Debugging

**Edge Function Logs:**
```bash
# View recent logs
supabase functions logs book-appointment --tail

# Search for specific appointment
supabase functions logs book-appointment | grep "APPOINTMENT_ID"
```

**Database Logs:**
Access via Supabase Dashboard → Logs → Database

**Analytics:**
Check `ai_responses` and `usage_logs` tables for AI performance metrics

---

## Automated Testing (Future)

**Unit Tests:**
- Service layer functions
- Date/time parsing utilities
- Slot availability logic

**Integration Tests:**
- Full booking flow (chat → availability → book)
- Conflict detection scenarios
- Token-based actions

**E2E Tests:**
- Playwright tests for UI flows
- API contract tests for edge functions

---

## Change Log

**v1.0.0 (Initial Release)**
- Complete booking flow via chat
- Manual appointment creation
- Public confirm/cancel pages
- Idempotency protection
- Audit logging
- Token-based authorization

---

For questions or issues, check edge function logs and appointment_logs table first.
