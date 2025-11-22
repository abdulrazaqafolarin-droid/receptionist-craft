#!/bin/bash
# Appointment Booking System - Comprehensive Smoke Tests
# Run this script after deploying all edge functions

# Configuration - UPDATE THESE VALUES
PROJECT_URL="https://xhihzexkqezhpwsryxqv.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoaWh6ZXhrcWV6aHB3c3J5eHF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2NjA0MTksImV4cCI6MjA3NjIzNjQxOX0.r6k7USvWZX-0A-yC11-tp0r3B9qVCX858Opja1ZWdIY"

# Test data - UPDATE WITH ACTUAL IDs from your database
RECEPTIONIST_ID="your-receptionist-id-here"
SERVICE_ID="your-service-id-here"

echo "🧪 Starting Appointment Booking Smoke Tests"
echo "============================================="
echo ""

# Test 1: Check Availability
echo "Test 1: Checking availability..."
AVAILABILITY_RESPONSE=$(curl -s -X POST "${PROJECT_URL}/functions/v1/check-availability" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -d "{
    \"receptionistId\": \"${RECEPTIONIST_ID}\",
    \"serviceId\": \"${SERVICE_ID}\",
    \"maxSlots\": 10
  }")

echo "Response: ${AVAILABILITY_RESPONSE}"
echo ""

# Extract first available slot (requires jq)
if command -v jq &> /dev/null; then
  FIRST_SLOT=$(echo $AVAILABILITY_RESPONSE | jq -r '.slots[0].start')
  echo "✅ First available slot: ${FIRST_SLOT}"
else
  echo "⚠️  Install jq to automatically extract slot times"
  FIRST_SLOT="2025-01-25T14:00:00.000Z"  # Fallback - UPDATE THIS
fi
echo ""

# Test 2: Book Appointment
echo "Test 2: Booking appointment..."
BOOKING_RESPONSE=$(curl -s -X POST "${PROJECT_URL}/functions/v1/book-appointment" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -d "{
    \"receptionistId\": \"${RECEPTIONIST_ID}\",
    \"serviceId\": \"${SERVICE_ID}\",
    \"startTime\": \"${FIRST_SLOT}\",
    \"customerName\": \"Test Customer\",
    \"customerEmail\": \"test@example.com\",
    \"customerPhone\": \"+1234567890\"
  }")

echo "Response: ${BOOKING_RESPONSE}"
echo ""

# Extract appointment details
if command -v jq &> /dev/null; then
  APPOINTMENT_ID=$(echo $BOOKING_RESPONSE | jq -r '.appointment.id')
  CANCEL_TOKEN=$(echo $BOOKING_RESPONSE | jq -r '.appointment.cancellation_token')
  CONFIRM_TOKEN=$(echo $BOOKING_RESPONSE | jq -r '.appointment.confirmation_token')
  
  echo "✅ Appointment created:"
  echo "   ID: ${APPOINTMENT_ID}"
  echo "   Cancel Token: ${CANCEL_TOKEN}"
  echo "   Confirm Token: ${CONFIRM_TOKEN}"
else
  echo "⚠️  Install jq to automatically extract appointment details"
  echo "   Manually extract appointmentId, cancellation_token, confirmation_token from response"
  read -p "Enter appointment ID: " APPOINTMENT_ID
  read -p "Enter cancellation token: " CANCEL_TOKEN
  read -p "Enter confirmation token: " CONFIRM_TOKEN
fi
echo ""

# Test 3: Conflict Detection
echo "Test 3: Testing conflict detection (should fail)..."
CONFLICT_RESPONSE=$(curl -s -X POST "${PROJECT_URL}/functions/v1/book-appointment" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -d "{
    \"receptionistId\": \"${RECEPTIONIST_ID}\",
    \"serviceId\": \"${SERVICE_ID}\",
    \"startTime\": \"${FIRST_SLOT}\",
    \"customerName\": \"Another Customer\",
    \"customerEmail\": \"another@example.com\"
  }")

echo "Response: ${CONFLICT_RESPONSE}"

if echo $CONFLICT_RESPONSE | grep -q "no longer available"; then
  echo "✅ Conflict detection working correctly"
else
  echo "❌ Conflict detection may not be working"
fi
echo ""

# Test 4: Confirm Appointment
echo "Test 4: Confirming appointment..."
CONFIRM_RESPONSE=$(curl -s -X POST "${PROJECT_URL}/functions/v1/confirm-appointment" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -d "{
    \"appointmentId\": \"${APPOINTMENT_ID}\",
    \"confirmationToken\": \"${CONFIRM_TOKEN}\"
  }")

echo "Response: ${CONFIRM_RESPONSE}"

if echo $CONFIRM_RESPONSE | grep -q "success"; then
  echo "✅ Appointment confirmed successfully"
else
  echo "❌ Confirmation failed"
fi
echo ""

# Test 5: Cancel Appointment
echo "Test 5: Cancelling appointment..."
CANCEL_RESPONSE=$(curl -s -X POST "${PROJECT_URL}/functions/v1/cancel-appointment" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -d "{
    \"appointmentId\": \"${APPOINTMENT_ID}\",
    \"cancellationToken\": \"${CANCEL_TOKEN}\",
    \"reason\": \"Test cancellation\"
  }")

echo "Response: ${CANCEL_RESPONSE}"

if echo $CANCEL_RESPONSE | grep -q "success"; then
  echo "✅ Appointment cancelled successfully"
else
  echo "❌ Cancellation failed"
fi
echo ""

# Test 6: Test Invalid Token
echo "Test 6: Testing invalid cancellation token (should fail)..."
INVALID_TOKEN_RESPONSE=$(curl -s -X POST "${PROJECT_URL}/functions/v1/cancel-appointment" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -d "{
    \"appointmentId\": \"${APPOINTMENT_ID}\",
    \"cancellationToken\": \"invalid-token-12345\",
    \"reason\": \"Test with invalid token\"
  }")

echo "Response: ${INVALID_TOKEN_RESPONSE}"

if echo $INVALID_TOKEN_RESPONSE | grep -q "Invalid"; then
  echo "✅ Token validation working correctly"
else
  echo "❌ Token validation may not be working"
fi
echo ""

# Test 7: Check Appointment Reminder
echo "Test 7: Testing appointment reminder function..."
REMINDER_RESPONSE=$(curl -s -X POST "${PROJECT_URL}/functions/v1/appointment-reminder-runner" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -d "{
    \"minutesAhead\": 15
  }")

echo "Response: ${REMINDER_RESPONSE}"

if echo $REMINDER_RESPONSE | grep -q "success"; then
  echo "✅ Reminder function working"
else
  echo "❌ Reminder function may have issues"
fi
echo ""

echo "============================================="
echo "🏁 Smoke Tests Complete!"
echo ""
echo "📋 Manual Verification Checklist:"
echo "   [ ] Check appointments table for created appointment"
echo "   [ ] Check notifications table for booking notification"
echo "   [ ] Check appointment_logs table for audit trail"
echo "   [ ] Verify cancellation notification was created"
echo "   [ ] Check that appointment status changed to 'cancelled'"
echo "   [ ] Test in UI: Navigate to /appointments page"
echo "   [ ] Test in chat: Ask AI to book an appointment"
echo ""
echo "🔗 Quick Database Queries:"
echo "   SELECT * FROM appointments WHERE id = '${APPOINTMENT_ID}';"
echo "   SELECT * FROM notifications WHERE metadata->>'appointment_id' = '${APPOINTMENT_ID}';"
echo "   SELECT * FROM appointment_logs WHERE appointment_id = '${APPOINTMENT_ID}';"
echo ""
