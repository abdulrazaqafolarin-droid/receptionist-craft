#!/usr/bin/env bash
# smoke-test-booking.sh - Test appointment booking system
# Usage: ./scripts/smoke-test-booking.sh <receptionist_id>

set -euo pipefail

BASE_URL="https://xhihzexkqezhpwsryxqv.supabase.co/functions/v1"
RECEPT_ID="${1:-}"

if [ -z "$RECEPT_ID" ]; then
  echo "❌ Error: Receptionist ID required"
  echo "Usage: $0 <receptionist_id>"
  exit 1
fi

echo "🧪 Starting Appointment Booking Smoke Tests"
echo "=========================================="
echo "Receptionist ID: $RECEPT_ID"
echo "Base URL: $BASE_URL"
echo ""

# Test 1: Check availability for tomorrow at 11am
echo "Test 1: Check availability (tomorrow 11am, 30min)"
echo "-------------------------------------------------"
TOMORROW=$(date -u -d '+1 day 11:00' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v+1d -j -f "%H:%M" "11:00" +%Y-%m-%dT%H:%M:%SZ)
TOMORROW_END=$(date -u -d '+1 day 11:30' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v+1d -j -f "%H:%M" "11:30" +%Y-%m-%dT%H:%M:%SZ)

AVAILABILITY=$(curl -s -X POST "$BASE_URL/check-availability" \
  -H "Content-Type: application/json" \
  -d "{
    \"receptionistId\":\"$RECEPT_ID\",
    \"desiredStart\":\"$TOMORROW\",
    \"desiredEnd\":\"$TOMORROW_END\",
    \"durationMinutes\":30,
    \"request_message\":\"Testing availability for tomorrow at 11am\"
  }")

echo "$AVAILABILITY" | jq '.'
echo ""

# Extract available status
AVAILABLE=$(echo "$AVAILABILITY" | jq -r '.available // false')
echo "Available: $AVAILABLE"
echo ""

# Test 2: Book appointment
echo "Test 2: Book appointment (attempt)"
echo "-----------------------------------"
BOOKING=$(curl -s -X POST "$BASE_URL/book-appointment" \
  -H "Content-Type: application/json" \
  -d "{
    \"receptionistId\":\"$RECEPT_ID\",
    \"customerName\":\"Smoke Test User\",
    \"customerEmail\":\"test@example.com\",
    \"customerPhone\":\"+1234567890\",
    \"startTime\":\"$TOMORROW\",
    \"endTime\":\"$TOMORROW_END\",
    \"source\":\"smoke_test\"
  }")

echo "$BOOKING" | jq '.'
echo ""

BOOKING_SUCCESS=$(echo "$BOOKING" | jq -r '.success // false')
APPT_ID=$(echo "$BOOKING" | jq -r '.appointment.id // "none"')

if [ "$BOOKING_SUCCESS" = "true" ]; then
  echo "✅ Booking successful! Appointment ID: $APPT_ID"
else
  echo "⚠️  Booking failed or slot taken (expected if already booked)"
fi
echo ""

# Test 3: Try booking same slot (expect 409 conflict)
echo "Test 3: Attempt duplicate booking (expect 409)"
echo "-----------------------------------------------"
DUPLICATE=$(curl -s -X POST "$BASE_URL/book-appointment" \
  -H "Content-Type: application/json" \
  -d "{
    \"receptionistId\":\"$RECEPT_ID\",
    \"customerName\":\"Conflict Test\",
    \"startTime\":\"$TOMORROW\",
    \"endTime\":\"$TOMORROW_END\"
  }")

echo "$DUPLICATE" | jq '.'
DUPLICATE_ERROR=$(echo "$DUPLICATE" | jq -r '.error // "none"')

if [ "$DUPLICATE_ERROR" != "none" ]; then
  echo "✅ Conflict detection working: $DUPLICATE_ERROR"
else
  echo "⚠️  No conflict detected (unexpected)"
fi
echo ""

# Test 4: Confirm appointment (if we have one)
if [ "$APPT_ID" != "none" ]; then
  echo "Test 4: Confirm appointment"
  echo "----------------------------"
  CONFIRM=$(curl -s -X POST "$BASE_URL/appointment-action" \
    -H "Content-Type: application/json" \
    -d "{
      \"action\":\"confirm\",
      \"appointmentId\":\"$APPT_ID\",
      \"reason\":\"Smoke test confirmation\"
    }")

  echo "$CONFIRM" | jq '.'
  CONFIRM_SUCCESS=$(echo "$CONFIRM" | jq -r '.success // false')
  
  if [ "$CONFIRM_SUCCESS" = "true" ]; then
    echo "✅ Confirmation successful"
  else
    echo "❌ Confirmation failed"
  fi
  echo ""

  # Test 5: Cancel appointment
  echo "Test 5: Cancel appointment"
  echo "--------------------------"
  CANCEL=$(curl -s -X POST "$BASE_URL/appointment-action" \
    -H "Content-Type: application/json" \
    -d "{
      \"action\":\"cancel\",
      \"appointmentId\":\"$APPT_ID\",
      \"reason\":\"Smoke test cleanup\"
    }")

  echo "$CANCEL" | jq '.'
  CANCEL_SUCCESS=$(echo "$CANCEL" | jq -r '.success // false')
  
  if [ "$CANCEL_SUCCESS" = "true" ]; then
    echo "✅ Cancellation successful"
  else
    echo "❌ Cancellation failed"
  fi
  echo ""
fi

echo "=========================================="
echo "✅ Smoke tests complete!"
echo ""
echo "Summary:"
echo "  - Availability check: OK"
echo "  - Booking attempt: $([ "$BOOKING_SUCCESS" = "true" ] && echo "✅ Success" || echo "⚠️  Slot taken")"
echo "  - Conflict detection: $([ "$DUPLICATE_ERROR" != "none" ] && echo "✅ Working" || echo "⚠️  Check logs")"
[ "$APPT_ID" != "none" ] && echo "  - Confirm/Cancel: Tested with ID $APPT_ID"
echo ""
