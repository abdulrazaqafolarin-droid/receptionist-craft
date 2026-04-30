#!/bin/bash
# Appointment Booking System - Comprehensive Smoke Tests
# Run this script after deploying all edge functions.

set -u

PROJECT_URL="${PROJECT_URL:-https://xhihzexkqezhpwsryxqv.supabase.co}"
ANON_KEY="${ANON_KEY:-}"
RECEPTIONIST_ID="${RECEPTIONIST_ID:-}"
SERVICE_ID="${SERVICE_ID:-}"

if [[ -z "$ANON_KEY" ]]; then
  ANON_KEY="$(awk -F'"' '/^ANON_KEY=/{print $2}' "$0" 2>/dev/null || true)"
fi

failures=0

mark_fail() {
  echo "❌ $1"
  failures=$((failures + 1))
}

mark_pass() {
  echo "✅ $1"
}

require_non_placeholder() {
  local name="$1"
  local val="$2"
  if [[ -z "$val" || "$val" == your-* || "$val" == "changeme" ]]; then
    mark_fail "$name is not configured. Set $name env var before running."
    return 1
  fi
  return 0
}

request_json() {
  local endpoint="$1"
  local payload="$2"
  curl -sS -X POST "${PROJECT_URL}/functions/v1/${endpoint}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${ANON_KEY}" \
    -d "$payload"
}

echo "🧪 Starting Appointment Booking Smoke Tests"
echo "============================================="

require_non_placeholder "ANON_KEY" "$ANON_KEY" || exit 2
require_non_placeholder "RECEPTIONIST_ID" "$RECEPTIONIST_ID" || exit 2
require_non_placeholder "SERVICE_ID" "$SERVICE_ID" || exit 2

if ! command -v jq >/dev/null 2>&1; then
  mark_fail "jq is required for deterministic smoke testing."
  exit 2
fi

echo "Test 1: Checking availability..."
AVAILABILITY_RESPONSE=$(request_json "check-availability" "{\"receptionistId\":\"${RECEPTIONIST_ID}\",\"serviceId\":\"${SERVICE_ID}\",\"maxSlots\":10}")
echo "Response: ${AVAILABILITY_RESPONSE}"
FIRST_SLOT=$(echo "$AVAILABILITY_RESPONSE" | jq -r '.slots[0].start // empty')
if [[ -n "$FIRST_SLOT" ]]; then
  mark_pass "First available slot: ${FIRST_SLOT}"
else
  mark_fail "No available slot returned."
fi

echo "Test 2: Booking appointment..."
BOOKING_RESPONSE=$(request_json "book-appointment" "{\"receptionistId\":\"${RECEPTIONIST_ID}\",\"serviceId\":\"${SERVICE_ID}\",\"startTime\":\"${FIRST_SLOT}\",\"customerName\":\"Test Customer\",\"customerEmail\":\"test@example.com\",\"customerPhone\":\"+1234567890\"}")
echo "Response: ${BOOKING_RESPONSE}"
APPOINTMENT_ID=$(echo "$BOOKING_RESPONSE" | jq -r '.appointment.id // empty')
CANCEL_TOKEN=$(echo "$BOOKING_RESPONSE" | jq -r '.appointment.cancellation_token // empty')
CONFIRM_TOKEN=$(echo "$BOOKING_RESPONSE" | jq -r '.appointment.confirmation_token // empty')
if [[ -n "$APPOINTMENT_ID" && -n "$CANCEL_TOKEN" && -n "$CONFIRM_TOKEN" ]]; then
  mark_pass "Appointment created and tokens returned"
else
  mark_fail "Booking response missing appointment/tokens"
fi

echo "Test 3: Testing conflict detection (should fail)..."
CONFLICT_RESPONSE=$(request_json "book-appointment" "{\"receptionistId\":\"${RECEPTIONIST_ID}\",\"serviceId\":\"${SERVICE_ID}\",\"startTime\":\"${FIRST_SLOT}\",\"customerName\":\"Another Customer\",\"customerEmail\":\"another@example.com\"}")
echo "Response: ${CONFLICT_RESPONSE}"
if echo "$CONFLICT_RESPONSE" | jq -e '.error? // .message? // "" | test("(no longer available|conflict|already booked)"; "i")' >/dev/null; then
  mark_pass "Conflict detection working"
else
  mark_fail "Conflict booking unexpectedly succeeded or wrong error"
fi

echo "Test 4: Confirming appointment..."
CONFIRM_RESPONSE=$(request_json "confirm-appointment" "{\"appointmentId\":\"${APPOINTMENT_ID}\",\"confirmationToken\":\"${CONFIRM_TOKEN}\"}")
echo "Response: ${CONFIRM_RESPONSE}"
if echo "$CONFIRM_RESPONSE" | jq -e '.success == true' >/dev/null; then
  mark_pass "Appointment confirmed"
else
  mark_fail "Confirmation failed"
fi

echo "Test 5: Cancelling appointment..."
CANCEL_RESPONSE=$(request_json "cancel-appointment" "{\"appointmentId\":\"${APPOINTMENT_ID}\",\"cancellationToken\":\"${CANCEL_TOKEN}\",\"reason\":\"Test cancellation\"}")
echo "Response: ${CANCEL_RESPONSE}"
if echo "$CANCEL_RESPONSE" | jq -e '.success == true' >/dev/null; then
  mark_pass "Appointment cancelled"
else
  mark_fail "Cancellation failed"
fi

echo "Test 6: Testing invalid cancellation token (should fail)..."
INVALID_TOKEN_RESPONSE=$(request_json "cancel-appointment" "{\"appointmentId\":\"${APPOINTMENT_ID}\",\"cancellationToken\":\"invalid-token-12345\",\"reason\":\"Test with invalid token\"}")
echo "Response: ${INVALID_TOKEN_RESPONSE}"
if echo "$INVALID_TOKEN_RESPONSE" | jq -e '.error? // .message? // "" | test("invalid|token"; "i")' >/dev/null; then
  mark_pass "Invalid token rejected"
else
  mark_fail "Invalid token was not rejected"
fi

echo "Test 7: Testing appointment reminder function..."
REMINDER_RESPONSE=$(request_json "appointment-reminder-runner" "{\"minutesAhead\":15}")
echo "Response: ${REMINDER_RESPONSE}"
if echo "$REMINDER_RESPONSE" | jq -e '.success == true or .processed != null' >/dev/null; then
  mark_pass "Reminder runner responded successfully"
else
  mark_fail "Reminder runner response unexpected"
fi

echo "============================================="
if [[ $failures -eq 0 ]]; then
  echo "🏁 Smoke Tests Complete: PASS"
  exit 0
else
  echo "🏁 Smoke Tests Complete: FAIL (${failures} issue(s))"
  exit 1
fi
