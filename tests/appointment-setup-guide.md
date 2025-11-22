# Appointment Booking System - Complete Setup & Testing Guide

## 🚀 Quick Start Setup

### Step 1: Database Setup

Run this SQL in your Supabase SQL editor (already completed via migration):

```sql
-- Verify tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('services', 'availability_rules', 'availability_exceptions', 'appointments', 'appointment_logs');
```

### Step 2: Create Test Data

#### Create a Service
```sql
INSERT INTO public.services (
  user_id,
  receptionist_id,
  name,
  description,
  duration_minutes,
  buffer_before_minutes,
  buffer_after_minutes,
  active
) VALUES (
  auth.uid(),  -- Your user ID
  'YOUR_RECEPTIONIST_ID',
  'Initial Consultation',
  '30-minute consultation appointment',
  30,
  5,
  10,
  true
) RETURNING id, name, duration_minutes;
```

Save the returned `id` - you'll need it for testing.

#### Create Availability Rules (Monday-Friday, 9 AM - 5 PM)
```sql
INSERT INTO public.availability_rules (
  receptionist_id,
  day_of_week,
  start_time,
  end_time,
  timezone,
  priority
) VALUES
  ('YOUR_RECEPTIONIST_ID', 1, '09:00', '17:00', 'America/New_York', 0),
  ('YOUR_RECEPTIONIST_ID', 2, '09:00', '17:00', 'America/New_York', 0),
  ('YOUR_RECEPTIONIST_ID', 3, '09:00', '17:00', 'America/New_York', 0),
  ('YOUR_RECEPTIONIST_ID', 4, '09:00', '17:00', 'America/New_York', 0),
  ('YOUR_RECEPTIONIST_ID', 5, '09:00', '17:00', 'America/New_York', 0);
```

**Note:** `day_of_week` uses 0=Sunday, 1=Monday, ..., 6=Saturday

#### (Optional) Add Holiday Exception
```sql
INSERT INTO public.availability_exceptions (
  receptionist_id,
  start_timestamptz,
  end_timestamptz,
  reason
) VALUES (
  'YOUR_RECEPTIONIST_ID',
  '2025-12-25 00:00:00+00',
  '2025-12-26 00:00:00+00',
  'Christmas Holiday'
);
```

### Step 3: Edge Functions Configuration

All edge functions are automatically deployed. They include:
- ✅ `check-availability` - Returns available time slots
- ✅ `book-appointment` - Creates appointments with tokens
- ✅ `cancel-appointment` - Cancels appointments via token
- ✅ `confirm-appointment` - Confirms appointments via token
- ✅ `appointment-reminder-runner` - Sends reminder notifications

## 🧪 Testing Guide

### Test 1: Check Availability

```bash
curl -X POST "https://xhihzexkqezhpwsryxqv.supabase.co/functions/v1/check-availability" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "receptionistId": "YOUR_RECEPTIONIST_ID",
    "serviceId": "YOUR_SERVICE_ID",
    "maxSlots": 10
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "slots": [
    {
      "start": "2025-01-24T14:00:00.000Z",
      "end": "2025-01-24T14:30:00.000Z",
      "display": "Fri, Jan 24, 2:00 PM"
    },
    ...
  ],
  "service": {
    "name": "Initial Consultation",
    "duration_minutes": 30
  }
}
```

### Test 2: Book Appointment

```bash
curl -X POST "https://xhihzexkqezhpwsryxqv.supabase.co/functions/v1/book-appointment" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "receptionistId": "YOUR_RECEPTIONIST_ID",
    "serviceId": "YOUR_SERVICE_ID",
    "startTime": "2025-01-24T14:00:00.000Z",
    "customerName": "John Doe",
    "customerEmail": "john@example.com",
    "customerPhone": "+1234567890"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "appointment": {
    "id": "abc123...",
    "customer_name": "John Doe",
    "start_time": "2025-01-24T14:00:00.000Z",
    "end_time": "2025-01-24T14:30:00.000Z",
    "status": "booked",
    "cancellation_token": "def456...",
    "confirmation_token": "ghi789...",
    "service_name": "Initial Consultation"
  }
}
```

**Save the tokens!** You'll need them for cancellation/confirmation.

### Test 3: Confirm Appointment

```bash
curl -X POST "https://xhihzexkqezhpwsryxqv.supabase.co/functions/v1/confirm-appointment" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "appointmentId": "APPOINTMENT_ID",
    "confirmationToken": "CONFIRMATION_TOKEN_FROM_BOOKING"
  }'
```

### Test 4: Cancel Appointment

```bash
curl -X POST "https://xhihzexkqezhpwsryxqv.supabase.co/functions/v1/cancel-appointment" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "appointmentId": "APPOINTMENT_ID",
    "cancellationToken": "CANCELLATION_TOKEN_FROM_BOOKING",
    "reason": "Customer requested cancellation"
  }'
```

### Test 5: Conflict Detection

Try booking the same time slot again (should fail with 409):

```bash
curl -X POST "https://xhihzexkqezhpwsryxqv.supabase.co/functions/v1/book-appointment" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "receptionistId": "YOUR_RECEPTIONIST_ID",
    "serviceId": "YOUR_SERVICE_ID",
    "startTime": "2025-01-24T14:00:00.000Z",
    "customerName": "Jane Smith",
    "customerEmail": "jane@example.com"
  }'
```

**Expected Response (409 Conflict):**
```json
{
  "error": "Selected time slot is no longer available",
  "conflicts": [...]
}
```

### Test 6: Appointment Reminders

```bash
curl -X POST "https://xhihzexkqezhpwsryxqv.supabase.co/functions/v1/appointment-reminder-runner" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "minutesAhead": 15
  }'
```

This checks for appointments starting in 15 minutes and creates reminder notifications.

## 🤖 AI Chat Integration Testing

### Test Booking via Chat

1. Navigate to your test receptionist: `/test/YOUR_RECEPTIONIST_ID`
2. Start a conversation: "I'd like to book an appointment"
3. AI should ask for details (name, service, preferred time)
4. Provide information: "My name is John Smith, I need a consultation"
5. AI will propose available time slots
6. Confirm a slot: "I'll take the 2 PM slot on Friday"
7. Verify appointment is created in database

### Expected AI Behavior

The AI receptionist should:
- ✅ Detect booking intent
- ✅ Collect customer information (name, phone/email)
- ✅ Ask about preferred service
- ✅ Propose 3-5 available time slots
- ✅ Confirm details before booking
- ✅ Provide cancellation link with token
- ✅ Send confirmation message with appointment details

## 📊 Database Verification Queries

### Check Created Appointments
```sql
SELECT 
  id,
  customer_name,
  customer_email,
  start_time,
  end_time,
  status,
  booking_source,
  metadata->>'cancellation_token' as cancel_token
FROM appointments
ORDER BY created_at DESC
LIMIT 10;
```

### Check Notifications
```sql
SELECT 
  type,
  title,
  body,
  severity,
  created_at,
  metadata
FROM notifications
WHERE category = 'appointments'
ORDER BY created_at DESC
LIMIT 10;
```

### Check Audit Logs
```sql
SELECT 
  al.action,
  al.created_at,
  al.payload,
  a.customer_name,
  a.start_time
FROM appointment_logs al
JOIN appointments a ON a.id = al.appointment_id
ORDER BY al.created_at DESC
LIMIT 10;
```

### Check Available Services
```sql
SELECT 
  id,
  name,
  duration_minutes,
  buffer_before_minutes,
  buffer_after_minutes,
  active
FROM services
WHERE active = true;
```

### Check Availability Rules
```sql
SELECT 
  day_of_week,
  start_time,
  end_time,
  timezone
FROM availability_rules
WHERE receptionist_id = 'YOUR_RECEPTIONIST_ID'
ORDER BY day_of_week;
```

## 🔒 Security Features

### Token-Based Cancellation
- Secure UUID tokens generated for each appointment
- Tokens stored in `metadata.cancellation_token` and `metadata.confirmation_token`
- No authentication required for cancel/confirm actions
- Tokens cannot be guessed or brute-forced

### Example Cancellation Link
```
https://your-app.com/cancel-appointment?id=APPOINTMENT_ID&token=CANCELLATION_TOKEN
```

### RLS Policies Applied
- Users can only view/manage appointments for their own receptionists
- Services are scoped to user ownership
- Audit logs are read-only for appointment owners

## 🎯 Success Criteria Checklist

- [ ] Database migrations ran successfully
- [ ] All edge functions deployed without errors
- [ ] Can create services via SQL or UI
- [ ] Can set availability rules (working hours)
- [ ] `check-availability` returns valid time slots
- [ ] `book-appointment` creates appointments with tokens
- [ ] Tokens are stored in `metadata` column
- [ ] Conflict detection prevents double-booking
- [ ] Buffer times prevent overlapping appointments
- [ ] Holiday exceptions block availability correctly
- [ ] Cancellation via token works
- [ ] Confirmation via token works
- [ ] Invalid tokens are rejected (403 error)
- [ ] Notifications created on booking
- [ ] Notifications created on cancellation
- [ ] Audit logs record all actions
- [ ] Appointments page displays correctly
- [ ] Filter tabs (All/Upcoming/Past) work
- [ ] AI chat can book appointments
- [ ] Reminder function creates notifications

## 🛠️ Troubleshooting

### No Slots Returned
- Check availability_rules exist for the receptionist
- Verify `day_of_week` values (0=Sunday, 6=Saturday)
- Ensure start_time and end_time are valid (HH:MM format)
- Check that requested dates are in the future
- Look for blocking exceptions

### Booking Fails with Conflict
- Check for existing appointments in that time window
- Verify buffer times aren't causing overlaps
- Query: `SELECT * FROM appointments WHERE receptionist_id = 'X' AND start_time >= 'DATE'`

### Token Validation Fails
- Ensure you're using the token from the booking response
- Check that appointment ID matches
- Verify appointment hasn't been deleted
- Tokens are case-sensitive UUIDs

### RLS Policy Errors
- Ensure user is authenticated
- Verify receptionist belongs to logged-in user
- Check that `user_id` or `receptionist_id` is properly set

## 📈 Performance Optimization

### Indexing (Already Applied)
- `idx_appointments_receptionist_start` - Fast appointment lookups
- `idx_services_receptionist` - Service filtering
- `idx_avail_receptionist` - Availability rule queries
- `idx_avail_ex_dates` - Exception checking

### Caching Strategy (Future Enhancement)
Consider caching available slots for frequently accessed time windows.

## 🔄 Next Steps

1. **Google Calendar Integration**
   - OAuth setup for calendar access
   - Two-way sync: fetch events → block slots
   - Auto-create calendar events on booking

2. **Email/SMS Reminders**
   - Send reminder 24 hours before appointment
   - Send reminder 1 hour before appointment
   - Send follow-up after completion

3. **Rescheduling Feature**
   - Allow customers to reschedule via token link
   - Check availability for new time
   - Update appointment and notify

4. **Analytics Dashboard**
   - Booking conversion rate
   - Popular time slots
   - No-show tracking
   - Revenue by service

5. **Customer Portal**
   - View upcoming appointments
   - Self-service cancellation/rescheduling
   - Appointment history
