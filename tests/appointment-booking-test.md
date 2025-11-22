# Appointment Booking System - Testing Guide

## Overview
This document provides comprehensive testing instructions for the AI-powered appointment booking system.

## Prerequisites
- Supabase project running
- Edge functions deployed
- At least one receptionist configured
- At least one service created

## 1. Database Setup

### Create Test Service
```sql
INSERT INTO public.services (
  receptionist_id,
  name,
  description,
  duration_minutes,
  buffer_before_minutes,
  buffer_after_minutes,
  active
) VALUES (
  'YOUR_RECEPTIONIST_ID',
  'Consultation',
  'Initial consultation appointment',
  30,
  5,
  5,
  true
);
```

### Create Availability Rules
```sql
-- Monday to Friday, 9 AM - 5 PM
INSERT INTO public.availability_rules (
  receptionist_id,
  day_of_week,
  start_time,
  end_time,
  timezone
) VALUES
  ('YOUR_RECEPTIONIST_ID', 1, '09:00', '17:00', 'America/New_York'),
  ('YOUR_RECEPTIONIST_ID', 2, '09:00', '17:00', 'America/New_York'),
  ('YOUR_RECEPTIONIST_ID', 3, '09:00', '17:00', 'America/New_York'),
  ('YOUR_RECEPTIONIST_ID', 4, '09:00', '17:00', 'America/New_York'),
  ('YOUR_RECEPTIONIST_ID', 5, '09:00', '17:00', 'America/New_York');
```

### Create Test Exception (Optional Holiday)
```sql
INSERT INTO public.availability_exceptions (
  receptionist_id,
  start_timestamptz,
  end_timestamptz,
  reason
) VALUES (
  'YOUR_RECEPTIONIST_ID',
  '2025-12-25 00:00:00+00',
  '2025-12-25 23:59:59+00',
  'Christmas Holiday'
);
```

## 2. Edge Function Testing

### Test check-availability

```bash
curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/check-availability" \
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
      "start": "2025-01-20T14:00:00.000Z",
      "end": "2025-01-20T14:30:00.000Z",
      "display": "Mon, Jan 20, 2:00 PM"
    },
    ...
  ],
  "service": {
    "id": "...",
    "name": "Consultation",
    "duration_minutes": 30
  }
}
```

### Test book-appointment

```bash
curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/book-appointment" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "receptionistId": "YOUR_RECEPTIONIST_ID",
    "serviceId": "YOUR_SERVICE_ID",
    "startTime": "2025-01-20T14:00:00.000Z",
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
    "id": "...",
    "customer_name": "John Doe",
    "start_time": "2025-01-20T14:00:00.000Z",
    "end_time": "2025-01-20T14:30:00.000Z",
    "status": "booked",
    "service_name": "Consultation"
  }
}
```

### Test Conflict Detection

Try booking the same time slot again - should receive 409 error:
```json
{
  "error": "Selected time slot is no longer available",
  "conflicts": [...]
}
```

## 3. Frontend UI Testing

### Appointments Page
1. Navigate to `/appointments`
2. Verify appointments list loads
3. Test filter tabs (All, Upcoming, Past)
4. Check appointment cards display correctly
5. Verify status badges are correct

### Smoke Test Checklist

- [ ] Database tables created successfully
- [ ] Edge functions deployed without errors
- [ ] Can create services via UI or SQL
- [ ] Can set availability rules
- [ ] check-availability returns valid slots
- [ ] book-appointment creates appointment
- [ ] Notifications created on booking
- [ ] Appointment logs recorded
- [ ] Conflict detection works
- [ ] Buffer times respected
- [ ] Exceptions block availability
- [ ] Appointments page displays data
- [ ] Filter tabs work correctly

## 4. AI Chat Integration Testing

1. Open the test receptionist chat
2. Say: "I'd like to book an appointment"
3. AI should ask for details
4. Provide: name, phone, preferred service
5. AI should offer available times
6. Confirm a time slot
7. Verify appointment created in database
8. Check notifications received

## 5. Common Issues & Solutions

### No available slots returned
- Check availability_rules exist for the receptionist
- Verify day_of_week matches (0=Sunday, 6=Saturday)
- Ensure times are not in the past
- Check for conflicting exceptions

### Booking fails with conflict error
- Another appointment exists in that time slot
- Buffer times may be overlapping
- Check existing appointments in database

### RLS Policy Errors
- Ensure user is authenticated
- Verify receptionist ownership
- Check RLS policies are enabled

## 6. Performance Testing

### Load Test check-availability
```bash
# Run 100 requests in parallel
for i in {1..100}; do
  curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/check-availability" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer YOUR_ANON_KEY" \
    -d '{"receptionistId":"...","serviceId":"..."}' &
done
wait
```

## 7. Integration with Google Calendar (Future)

Placeholder for Google Calendar sync testing once implemented.

## Notes

- All times are stored in UTC in the database
- Display times should use user's timezone
- Buffers prevent back-to-back bookings
- Status can be: booked, confirmed, cancelled, completed
- Booking source tracks where appointment came from (ai_receptionist, manual, api)
