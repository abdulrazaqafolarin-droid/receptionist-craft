# AI Booking Flow - Smoke Test Guide

## Overview
This document provides step-by-step instructions for manually testing the AI booking flow in the chat function.

## Prerequisites
1. Active receptionist configured in the system
2. At least one service created
3. Availability rules set up for the receptionist
4. User account with access to Builder page

## Test Scenarios

### Scenario 1: Complete Booking Flow (Happy Path)

**Objective:** Verify end-to-end booking with all information provided

**Steps:**
1. Navigate to Builder page (`/builder/:receptionistId`)
2. In chat input, type: 
   ```
   I want to book a haircut tomorrow at 3pm for John Doe, my phone is +2348012345678
   ```
3. Send message

**Expected Result:**
- AI extracts: service (haircut), date (tomorrow), time (3pm), name (John Doe), contact (+2348012345678)
- System checks availability
- If available: Confirms booking with appointment ID
- If unavailable: Returns 3 alternative time slots
- New appointment appears in `appointments` table
- Notification created in `notifications` table
- Chat messages logged in `chat_messages` table

**Pass Criteria:**
- ✅ Booking confirmation message received
- ✅ Appointment ID returned
- ✅ Appointment visible in database
- ✅ Notification created for receptionist owner

---

### Scenario 2: Missing Information (Clarification Flow)

**Objective:** Verify AI asks clarifying questions

**Steps:**
1. In chat, type:
   ```
   I need an appointment
   ```
2. Send message
3. Observe AI response
4. Provide missing info based on what AI asks

**Expected Result:**
- AI identifies missing: service, date, time
- AI asks: "I can help book that appointment. Could you tell me which service you need, your preferred date and time?"
- After providing info, booking completes

**Pass Criteria:**
- ✅ AI identifies missing fields correctly
- ✅ Clarifying question is clear and helpful
- ✅ Follow-up completes booking after info provided

---

### Scenario 3: Unavailable Time (Alternatives Flow)

**Objective:** Verify alternative suggestions when requested time is unavailable

**Steps:**
1. In chat, type:
   ```
   Book me for midnight tonight
   ```
2. Send message
3. Observe alternatives offered
4. Reply with:
   ```
   accept_alternative:2
   ```
5. Send message

**Expected Result:**
- AI checks availability for midnight
- Finds slot unavailable
- Returns 3 nearest available alternatives with formatted times
- Response includes "accept_alternative:X" instruction
- After accepting, appointment is booked for selected alternative
- Confirmation message with appointment ID

**Pass Criteria:**
- ✅ Up to 3 alternatives returned
- ✅ Alternatives are human-readable (e.g., "December 1 at 9:00 AM")
- ✅ Accepting alternative completes booking
- ✅ Alternative booking creates correct appointment time

---

### Scenario 4: Idempotency (Duplicate Prevention)

**Objective:** Verify duplicate bookings are prevented

**Steps:**
1. Complete a booking (Scenario 1)
2. Note the appointment ID
3. Immediately send the EXACT SAME booking message again
4. Observe response

**Expected Result:**
- Second request recognizes duplicate via idempotency key
- Returns existing appointment details
- No new appointment created
- Message indicates appointment already exists

**Pass Criteria:**
- ✅ No duplicate appointment in database
- ✅ Response mentions existing appointment
- ✅ Same appointment ID returned

---

### Scenario 5: Missing Contact Info

**Objective:** Verify system requests contact before final booking

**Steps:**
1. In chat, type:
   ```
   Book haircut tomorrow at 2pm for Sarah
   ```
2. Send message
3. Observe AI response
4. Provide phone or email when asked

**Expected Result:**
- AI extracts all fields except contact
- AI responds: "Great! I can book that time. Could you provide your phone number or email to confirm the appointment?"
- After providing contact, booking completes

**Pass Criteria:**
- ✅ AI specifically asks for contact info
- ✅ Booking proceeds after contact provided
- ✅ Contact stored correctly in appointment

---

### Scenario 6: Relative Dates

**Objective:** Verify AI parses relative date expressions

**Steps:**
Test these phrases:
1. "tomorrow at 3pm"
2. "next Monday at 10am"
3. "this Friday afternoon"

**Expected Result:**
- AI converts relative dates to ISO format
- Booking proceeds with correct parsed date

**Pass Criteria:**
- ✅ "tomorrow" = current date + 1 day
- ✅ "next Monday" = correct Monday date
- ✅ Relative times parsed correctly

---

### Scenario 7: Time Format Variations

**Objective:** Verify AI handles different time formats

**Steps:**
Test these time formats:
1. "3pm"
2. "15:00"
3. "3:30 in the afternoon"
4. "quarter past 2"

**Expected Result:**
- All formats parsed to 24h time (HH:MM)
- Booking uses correct time

**Pass Criteria:**
- ✅ "3pm" → "15:00"
- ✅ "15:00" → "15:00"
- ✅ Natural language times parsed correctly

---

### Scenario 8: Error Handling

**Objective:** Verify graceful error handling

**Steps:**
1. Test with invalid receptionist ID (modify URL)
2. Test with network disconnected
3. Test with rate limit (send many requests quickly)

**Expected Result:**
- Clear error messages displayed
- No system crashes
- User-friendly guidance provided

**Pass Criteria:**
- ✅ Invalid receptionist: "Receptionist not found" or similar
- ✅ Network error: "Connection failed, please try again"
- ✅ Rate limit: "System busy, please wait"

---

## Automated Smoke Test

For automated testing, run:

```bash
chmod +x scripts/smoke-test-booking.sh
./scripts/smoke-test-booking.sh
```

The script will:
1. Prompt for receptionist ID and user ID
2. Test natural language booking
3. Test alternatives flow
4. Test accepting an alternative
5. Optionally clean up test appointments

---

## Database Verification

After each test, verify database state:

### Check Appointment Created
```sql
SELECT * FROM appointments 
WHERE receptionist_id = 'YOUR_RECEPTIONIST_ID'
ORDER BY created_at DESC 
LIMIT 5;
```

### Check Logs
```sql
SELECT * FROM appointment_logs 
WHERE appointment_id = 'YOUR_APPOINTMENT_ID'
ORDER BY created_at DESC;
```

### Check Notifications
```sql
SELECT * FROM notifications 
WHERE type = 'appointment.created'
ORDER BY created_at DESC 
LIMIT 5;
```

### Check Chat Messages
```sql
SELECT sender, message, metadata 
FROM chat_messages 
WHERE receptionist_id = 'YOUR_RECEPTIONIST_ID'
ORDER BY created_at DESC 
LIMIT 10;
```

### Check Analytics
```sql
SELECT request_message, reply_text, latency_ms, quality_score 
FROM ai_responses 
WHERE receptionist_id = 'YOUR_RECEPTIONIST_ID'
ORDER BY created_at DESC 
LIMIT 5;
```

---

## Troubleshooting

### Issue: "Slot extraction failed"
**Solution:** Check Lovable AI credits. Ensure `LOVABLE_API_KEY` is configured.

### Issue: "No available slots"
**Solution:** Verify receptionist has availability rules configured for requested date/time.

### Issue: "Failed to book appointment"
**Solution:** Check `book-appointment` edge function logs. Verify service exists and is active.

### Issue: Alternatives not clickable
**Solution:** Ensure Builder.tsx has `alternatives` UI rendering correctly (lines 370-400).

### Issue: Duplicate appointments created
**Solution:** Verify idempotency key generation. Check `metadata.idempotency_key` in appointments table.

---

## Success Metrics

A successful booking flow should achieve:
- ✅ <3s average latency for slot extraction
- ✅ >90% accuracy in intent detection
- ✅ 100% idempotency (no duplicates)
- ✅ Clear error messages for all failure cases
- ✅ All logs and analytics captured

---

## Next Steps

After smoke tests pass:
1. Test with real users
2. Monitor analytics for quality scores
3. Review chat logs for common clarification patterns
4. Optimize system prompts based on user feedback
