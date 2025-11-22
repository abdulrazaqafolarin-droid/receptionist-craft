# AI-Driven Appointment Booking System

## Overview

The Rutex FrontDesk booking system provides intelligent appointment scheduling with AI-powered alternative suggestions, conflict detection, audit logging, and a seamless user experience.

## Features Implemented

### ✅ Core Booking Features
- **Conflict Detection**: Prevents double-booking with buffer time support
- **Alternative Suggestions**: AI-scored alternatives when requested time unavailable
- **Appointment Actions**: Confirm, cancel, and reschedule operations
- **Audit Logging**: Complete trail of all appointment changes
- **Real-time Notifications**: Owner alerts for all booking events
- **Analytics**: Track booking patterns and suggestions

### ✅ Database Tables
- `appointments` - Main booking records with status tracking
- `appointment_logs` - Audit trail with actor tracking
- `appointment_slots` - Optional caching for high-performance scenarios
- `ai_booking_suggestions` - AI-generated alternatives with scoring
- `services` - Service definitions with duration and buffers
- `availability_rules` - Weekly recurring schedules
- `availability_exceptions` - Holidays and blocked periods

### ✅ Edge Functions
1. **check-availability** - Returns available slots + scored alternatives
2. **book-appointment** - Creates appointments with conflict checking
3. **appointment-action** - Unified confirm/cancel/reschedule handler
4. **chat** - AI receptionist with booking intent detection (updated)

### ✅ UI Components
- **Builder Chat Interface** - Shows alternatives as clickable cards
- **Alternative Time Picker** - Visual selection with match scores
- **Booking Confirmation** - Toast notifications and audit trails

## Architecture

```
User Chat Input
    ↓
chat Edge Function (AI intent detection)
    ↓
Slot Extraction (service, date, time, name, contact)
    ↓
check-availability Edge Function
    ↓
- Query availability_rules & exceptions
- Check existing appointments
- Generate scored alternatives
- Store in ai_booking_suggestions
    ↓
Return: available | alternatives[]
    ↓
UI: Show alternative cards
    ↓
User clicks "Book This Time"
    ↓
book-appointment Edge Function
    ↓
- Validate receptionist
- Check conflicts (with buffers)
- Insert appointment
- Create audit log
- Send notification
    ↓
Success: Toast + Update UI
```

## API Reference

### check-availability

**Endpoint:** `POST /functions/v1/check-availability`

**Request:**
```json
{
  "receptionistId": "uuid",
  "serviceId": "uuid (optional)",
  "desiredStart": "2025-01-23T10:00:00Z",
  "desiredEnd": "2025-01-23T10:30:00Z",
  "durationMinutes": 30,
  "request_message": "Customer wants appointment tomorrow at 10am"
}
```

**Response (available):**
```json
{
  "success": true,
  "available": true,
  "slots": [
    {
      "start": "2025-01-23T10:00:00Z",
      "end": "2025-01-23T10:30:00Z",
      "display": "Wed, Jan 23 • 10:00 AM"
    }
  ]
}
```

**Response (unavailable with alternatives):**
```json
{
  "success": true,
  "available": false,
  "alternatives": [
    {
      "start": "2025-01-23T11:00:00Z",
      "end": "2025-01-23T11:30:00Z",
      "score": 0.92,
      "reason": "Wed, Jan 23 • 11:00 AM (1.0h from requested)"
    }
  ]
}
```

### book-appointment

**Endpoint:** `POST /functions/v1/book-appointment`

**Request:**
```json
{
  "receptionistId": "uuid",
  "customerName": "Jane Doe",
  "customerEmail": "jane@example.com",
  "customerPhone": "+1234567890",
  "startTime": "2025-01-23T10:00:00Z",
  "endTime": "2025-01-23T10:30:00Z",
  "serviceId": "uuid (optional)",
  "userId": "uuid (optional)",
  "source": "ai_receptionist",
  "metadata": {}
}
```

**Response (success):**
```json
{
  "success": true,
  "appointment": {
    "id": "uuid",
    "receptionist_id": "uuid",
    "customer_name": "Jane Doe",
    "start_time": "2025-01-23T10:00:00Z",
    "end_time": "2025-01-23T10:30:00Z",
    "status": "booked",
    "created_at": "2025-01-22T12:00:00Z"
  }
}
```

**Response (conflict):**
```json
{
  "error": "Time slot unavailable",
  "conflicts": [
    {
      "id": "uuid",
      "start_time": "2025-01-23T09:45:00Z",
      "end_time": "2025-01-23T10:15:00Z"
    }
  ]
}
```
**Status Codes:**
- `200` - Success
- `409` - Conflict (slot unavailable)
- `400` - Bad request (missing fields)
- `404` - Receptionist not found

### appointment-action

**Endpoint:** `POST /functions/v1/appointment-action`

**Confirm:**
```json
{
  "action": "confirm",
  "appointmentId": "uuid",
  "userId": "uuid (optional)",
  "reason": "Customer confirmed via phone"
}
```

**Cancel:**
```json
{
  "action": "cancel",
  "appointmentId": "uuid",
  "reason": "Customer requested cancellation"
}
```

**Reschedule:**
```json
{
  "action": "reschedule",
  "appointmentId": "uuid",
  "newStartTime": "2025-01-24T10:00:00Z",
  "newEndTime": "2025-01-24T10:30:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "action": "confirm",
  "appointmentId": "uuid"
}
```

## Usage Examples

### 1. Basic Booking Flow (Client)

```typescript
// Check if time available
const { data: availability } = await supabase.functions.invoke("check-availability", {
  body: {
    receptionistId: "rec-123",
    desiredStart: "2025-01-23T10:00:00Z",
    desiredEnd: "2025-01-23T10:30:00Z",
    durationMinutes: 30
  }
});

if (availability.available) {
  // Book directly
  const { data: booking } = await supabase.functions.invoke("book-appointment", {
    body: {
      receptionistId: "rec-123",
      customerName: "Jane Doe",
      startTime: "2025-01-23T10:00:00Z",
      endTime: "2025-01-23T10:30:00Z"
    }
  });
  
  if (booking.success) {
    console.log("Booked:", booking.appointment.id);
  }
} else {
  // Show alternatives
  console.log("Alternatives:", availability.alternatives);
  // User picks one, then book using selected time
}
```

### 2. Chat-Driven Booking

The chat function automatically handles booking when it detects intent:

```typescript
const { data } = await supabase.functions.invoke("chat", {
  body: {
    messages: [
      { role: "user", content: "I need to book a cleaning for tomorrow at 2pm" }
    ],
    receptionistId: "rec-123",
    userId: "user-456"
  }
});

// Chat function:
// 1. Extracts: service=cleaning, date=tomorrow, time=2pm
// 2. Calls check-availability
// 3. Returns alternatives if needed
// 4. Calls book-appointment when user confirms

if (data.alternatives) {
  // Show alternatives in UI
} else if (data.appointment) {
  // Booking successful
}
```

### 3. Reschedule Appointment

```typescript
const { data } = await supabase.functions.invoke("appointment-action", {
  body: {
    action: "reschedule",
    appointmentId: "appt-789",
    newStartTime: "2025-01-24T14:00:00Z",
    newEndTime: "2025-01-24T14:30:00Z"
  }
});

if (data.success) {
  console.log("Rescheduled successfully");
}
```

## Testing

### Run Smoke Tests
```bash
chmod +x scripts/smoke-test-booking.sh
./scripts/smoke-test-booking.sh <receptionist-id>
```

Tests:
- ✅ Availability check
- ✅ Booking creation
- ✅ Conflict detection
- ✅ Confirm operation
- ✅ Cancel operation

### Manual Testing
1. Navigate to `/builder/:receptionistId`
2. In chat: "Book appointment for tomorrow at 3pm"
3. Select an alternative time card
4. Verify:
   - Toast notification appears
   - Appointment in database
   - Audit log entry created
   - Notification sent to owner

## Configuration

### Service Settings
Configure services with appropriate buffers:

```sql
INSERT INTO services (receptionist_id, name, duration_minutes, buffer_before_minutes, buffer_after_minutes)
VALUES 
  ('rec-123', 'Consultation', 30, 5, 5),
  ('rec-123', 'Full Service', 60, 10, 10);
```

### Availability Rules
Set weekly recurring hours:

```sql
INSERT INTO availability_rules (receptionist_id, day_of_week, start_time, end_time, timezone)
VALUES 
  ('rec-123', 1, '09:00', '17:00', 'America/New_York'), -- Monday
  ('rec-123', 2, '09:00', '17:00', 'America/New_York'), -- Tuesday
  ('rec-123', 3, '09:00', '17:00', 'America/New_York'); -- Wednesday
```

### Exceptions (Holidays)
Block out unavailable periods:

```sql
INSERT INTO availability_exceptions (receptionist_id, start_timestamptz, end_timestamptz, reason)
VALUES 
  ('rec-123', '2025-12-25 00:00:00+00', '2025-12-25 23:59:59+00', 'Christmas Day');
```

## Security

### Row-Level Security (RLS)
All tables enforce RLS:
- Users can only access appointments for their receptionists
- Audit logs protected from tampering
- AI suggestions restricted by receptionist ownership

### Best Practices
1. **Never disable RLS** on appointment tables
2. **Validate inputs** in edge functions before DB operations
3. **Use service role key** only in edge functions (server-side)
4. **Rate limit** public booking endpoints
5. **Sanitize logs** - never log customer PII in analytics

## Observability

### Metrics Tracked
- Booking success rate
- Conflict rate (409 responses)
- Alternative selection rate
- Average response time per function
- Booking sources breakdown

### Audit Trail
Every appointment change creates:
- `appointment_logs` entry with action type
- Actor ID (who made the change)
- Payload (before/after state)
- Timestamp

Query audit trail:
```sql
SELECT * FROM appointment_logs 
WHERE appointment_id = 'appt-789'
ORDER BY created_at DESC;
```

### Analytics Query
```sql
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_suggestions,
  AVG((suggestions->0->>'score')::float) as avg_score
FROM ai_booking_suggestions
WHERE receptionist_id = 'rec-123'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

## Troubleshooting

### Alternatives not showing
**Symptom:** UI doesn't display alternative times  
**Check:**
1. `check-availability` returns `alternatives` array
2. Chat function passes alternatives to client
3. Builder state `setAlternatives` called

**Fix:**
```typescript
// In Builder.tsx, verify:
if (result.alternatives && result.alternatives.length > 0) {
  setAlternatives(result.alternatives);
}
```

### Bookings fail with 409
**Symptom:** All bookings return conflict  
**Check:**
1. Query `appointments` table for overlapping times
2. Verify service `buffer_before_minutes` and `buffer_after_minutes`
3. Check if exception exists for that time

**Fix:**
```sql
-- Find conflicting appointment
SELECT * FROM appointments 
WHERE receptionist_id = 'rec-123'
AND status != 'cancelled'
AND start_time < '2025-01-23T10:30:00Z'
AND end_time > '2025-01-23T10:00:00Z';
```

### No notifications received
**Symptom:** Notifications table empty after booking  
**Check:**
1. Edge function logs for notification insert errors
2. Receptionist user_id matches authenticated user
3. RLS policies on notifications table

**Fix:**
```sql
-- Verify notification was created
SELECT * FROM notifications 
WHERE type = 'appointment.created'
ORDER BY created_at DESC LIMIT 10;
```

## Roadmap

### Phase 2 (Planned)
- [ ] Google Calendar bidirectional sync
- [ ] SMS confirmations via Twilio
- [ ] Email reminders via SendGrid
- [ ] Recurring appointments
- [ ] Multi-service bookings
- [ ] Payment integration (deposits)

### Phase 3 (Future)
- [ ] Resource allocation (rooms, equipment)
- [ ] Staff assignment
- [ ] Waitlist management
- [ ] Customer self-service portal
- [ ] Advanced analytics dashboard

## Support

For issues:
1. Check edge function logs in Lovable dashboard
2. Query `appointment_logs` for audit trail
3. Run smoke tests to isolate failures
4. Review this documentation

## License

Internal Rutex FrontDesk project - Not for external distribution.

---

**Last Updated:** 2025-01-22  
**Version:** 1.0.0  
**Maintainer:** Rutex FrontDesk Engineering
