# Appointment System QA & Testing Guide

Comprehensive testing procedures for the AI receptionist appointment booking system.

---

## Quick Start

```bash
# Run automated smoke test
chmod +x scripts/smoke-booking.sh
SUPABASE_URL="https://your-project.supabase.co" \
SERVICE_ROLE_KEY="your-key" \
./scripts/smoke-booking.sh
```

---

## Manual Test Scenarios

### ✅ Test 1: Complete Booking Flow (Chat AI)

**Verify**: End-to-end booking via AI chat

1. Go to `/builder/:receptionistId`
2. Chat: "I need an appointment"
3. Provide: Service, Date, Time, Contact
4. Verify: Appointment confirmed with ID

**Pass**: Appointment created in DB, notification sent, email sent

---

### ✅ Test 2: Contact Validation

**Verify**: System blocks booking without contact

1. Start booking flow
2. Provide service, date, time
3. Skip contact info
4. Verify: AI asks for contact, booking blocked

**Pass**: No appointment without email/phone

---

### ✅ Test 3: Slot Conflicts

**Verify**: Double-booking prevention

1. Book 2PM tomorrow
2. Try booking 2PM tomorrow again (different customer)
3. Verify: Conflict error + alternatives offered

**Pass**: Conflict detected, alternatives shown

---

### ✅ Test 4: Idempotency

**Verify**: Duplicate prevention

1. Book with idempotency key
2. Send exact same request
3. Verify: Returns existing appointment

**Pass**: No duplicate created

---

### ✅ Test 5: Public Confirmation

**Verify**: Token-based confirmation works

1. Create appointment
2. Get `confirmation_token` from DB
3. Visit `/confirm-appointment?token=<token>`
4. Click Confirm
5. Verify: Status → "confirmed", log created

**Pass**: Appointment confirmed via public page

---

### ✅ Test 6: Public Cancellation

**Verify**: Token-based cancellation works

1. Create appointment
2. Get `cancellation_token` from DB
3. Visit `/cancel-appointment?token=<token>`
4. Enter reason (optional)
5. Click Cancel
6. Verify: Status → "cancelled", log created

**Pass**: Appointment cancelled via public page

---

### ✅ Test 7: Manual Creation (Owner)

**Verify**: Appointments page modal works

1. Go to `/appointments`
2. Click "Create Appointment"
3. Fill form: service, date, time, customer, contact
4. Click Create
5. Verify: Appears in calendar, notification sent

**Pass**: Appointment created from UI

---

### ✅ Test 8: Manual Edit (Owner)

**Verify**: Edit existing appointment

1. Create appointment
2. Click appointment in calendar
3. Change time
4. Save
5. Verify: Time updated, logged

**Pass**: Appointment edited successfully

---

## Database Verification

### Check Appointment

```sql
SELECT 
  id, receptionist_id, service, customer_name,
  customer_email, customer_phone, start_time, 
  end_time, status, booking_source, created_at
FROM appointments
WHERE customer_email = 'test@example.com'
ORDER BY created_at DESC LIMIT 5;
```

### Check Audit Trail

```sql
SELECT * FROM appointment_logs
WHERE appointment_id = '<id>'
ORDER BY created_at DESC;
```

### Check Notifications

```sql
SELECT * FROM notifications
WHERE metadata->>'appointment_id' = '<id>'
ORDER BY created_at DESC;
```

### Verify Contact Info

```sql
SELECT id, customer_name, customer_email, customer_phone,
  CASE 
    WHEN customer_email IS NOT NULL OR customer_phone IS NOT NULL 
    THEN 'PASS' ELSE 'FAIL' 
  END as has_contact
FROM appointments
WHERE created_at > NOW() - INTERVAL '1 day';
```

---

## Troubleshooting

### Issue: "Contact information required" error

**Fix**: Ensure `customerEmail` OR `customerPhone` provided

**Check**:
```sql
SELECT * FROM appointments 
WHERE customer_email IS NULL AND customer_phone IS NULL;
```

---

### Issue: Slot extraction fails

**Symptoms**: AI doesn't parse date/time from user

**Fix**:
- Verify Lovable AI credits not exhausted
- Check for rate limiting (429 error)
- Review slot extraction prompt in `chat/index.ts`

---

### Issue: Idempotency not working

**Symptoms**: Duplicate appointments created

**Check**:
```sql
SELECT customer_email, start_time, COUNT(*) as count
FROM appointments
WHERE created_at > NOW() - INTERVAL '1 day'
GROUP BY customer_email, start_time
HAVING COUNT(*) > 1;
```

**Fix**: Ensure `idempotency_key` passed in metadata

---

### Issue: Token expired on public pages

**Check**:
```sql
SELECT id, confirmation_token, cancellation_token
FROM appointments WHERE id = '<id>';
```

**Fix**: Verify tokens generated in `book-appointment`

---

## Rollback SQL

**⚠️ Use only if absolutely necessary - will delete data**

```sql
-- Remove columns (if needed)
ALTER TABLE appointments DROP COLUMN IF EXISTS customer_email CASCADE;
ALTER TABLE appointments DROP COLUMN IF EXISTS customer_phone CASCADE;
ALTER TABLE appointments DROP COLUMN IF EXISTS idempotency_key CASCADE;
ALTER TABLE appointments DROP COLUMN IF EXISTS confirmation_token CASCADE;
ALTER TABLE appointments DROP COLUMN IF EXISTS cancellation_token CASCADE;

-- Drop tables (if needed)
DROP TABLE IF EXISTS appointment_logs CASCADE;

-- Remove indexes
DROP INDEX IF EXISTS idx_appointments_start_time;
DROP INDEX IF EXISTS idx_appointments_status;
DROP INDEX IF EXISTS idx_appointments_idempotency_key;
```

---

## Success Metrics

After all tests:

- ✅ **Booking Success**: 100% for valid requests
- ✅ **Idempotency**: 0 duplicates with same key
- ✅ **Contact Validation**: 0 bookings without contact
- ✅ **Conflict Detection**: 0 double-bookings
- ✅ **Audit Trail**: All actions in appointment_logs
- ✅ **Notifications**: Sent for all bookings
- ✅ **Emails**: Sent when customer email provided
- ✅ **Token Security**: Public pages work only with valid tokens

---

## Daily Monitoring

```bash
# Add to cron for automated daily checks
0 9 * * * /path/to/scripts/smoke-booking.sh
```

---

**Version**: 1.0.0  
**Last Updated**: 2025-01-29
