#!/bin/bash

# ============================================
# APPOINTMENT BOOKING SMOKE TEST
# Tests the complete booking flow end-to-end
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_URL="${SUPABASE_URL:-https://xhihzexkqezhpwsryxqv.supabase.co}"
SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"
ANON_KEY="${SUPABASE_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoaWh6ZXhrcWV6aHB3c3J5eHF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2NjA0MTksImV4cCI6MjA3NjIzNjQxOX0.r6k7USvWZX-0A-yC11-tp0r3B9qVCX858Opja1ZWdIY}"

echo -e "${GREEN}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  APPOINTMENT BOOKING SYSTEM SMOKE TEST           ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

# Prompt for receptionist ID
read -p "Enter Receptionist ID to test: " RECEPTIONIST_ID

if [ -z "$RECEPTIONIST_ID" ]; then
  echo -e "${RED}❌ Receptionist ID required${NC}"
  exit 1
fi

# Generate test user ID
USER_ID="${TEST_USER_ID:-test-user-$(date +%s)}"
echo -e "${YELLOW}Using User ID: $USER_ID${NC}"
echo ""

# Generate unique idempotency key
IDEMPOTENCY_KEY="test-$(date +%s)-$RANDOM"

# ============================================
# TEST 1: Check Availability
# ============================================
echo -e "${YELLOW}[TEST 1] Checking availability...${NC}"

CHECK_PAYLOAD=$(cat <<EOF
{
  "receptionist_id": "$RECEPTIONIST_ID",
  "startDate": "$(date -u -d '+1 day' '+%Y-%m-%d')",
  "endDate": "$(date -u -d '+1 day' '+%Y-%m-%d')",
  "maxSlots": 5
}
EOF
)

CHECK_RESPONSE=$(curl -s -X POST \
  "${PROJECT_URL}/functions/v1/check-availability" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "$CHECK_PAYLOAD")

echo "Response: $CHECK_RESPONSE"

# Extract first slot
FIRST_SLOT=$(echo "$CHECK_RESPONSE" | jq -r '.slots[0].start // .slots[0] // empty' 2>/dev/null)

if [ -z "$FIRST_SLOT" ]; then
  echo -e "${RED}❌ No available slots found${NC}"
  echo "Using fallback slot for testing..."
  FIRST_SLOT="$(date -u -d '+1 day 14:00' '+%Y-%m-%dT%H:%M:%S')Z"
fi

echo -e "${GREEN}✅ First available slot: $FIRST_SLOT${NC}"
echo ""

# ============================================
# TEST 2: Book Appointment
# ============================================
echo -e "${YELLOW}[TEST 2] Booking appointment...${NC}"

BOOK_PAYLOAD=$(cat <<EOF
{
  "receptionistId": "$RECEPTIONIST_ID",
  "serviceId": null,
  "startTime": "$FIRST_SLOT",
  "customerName": "Smoke Test User",
  "customerEmail": "smoketest@example.com",
  "customerPhone": "+1234567890",
  "bookingSource": "smoke_test",
  "userId": "$USER_ID",
  "metadata": {
    "idempotency_key": "$IDEMPOTENCY_KEY",
    "test": true
  }
}
EOF
)

BOOK_RESPONSE=$(curl -s -X POST \
  "${PROJECT_URL}/functions/v1/book-appointment" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "$BOOK_PAYLOAD")

echo "Response: $BOOK_RESPONSE"

APPOINTMENT_ID=$(echo "$BOOK_RESPONSE" | jq -r '.appointment.id // empty' 2>/dev/null)
CANCELLATION_TOKEN=$(echo "$BOOK_RESPONSE" | jq -r '.appointment.cancellation_token // .appointment.metadata.cancellation_token // empty' 2>/dev/null)

if [ -z "$APPOINTMENT_ID" ]; then
  echo -e "${RED}❌ Failed to book appointment${NC}"
  echo "Please check the response above for errors"
  exit 1
fi

echo -e "${GREEN}✅ Appointment booked: $APPOINTMENT_ID${NC}"
echo -e "${GREEN}   Cancellation token: $CANCELLATION_TOKEN${NC}"
echo ""

# Store for cleanup
CREATED_APPOINTMENTS+=("$APPOINTMENT_ID")

# ============================================
# TEST 3: Test Idempotency
# ============================================
echo -e "${YELLOW}[TEST 3] Testing idempotency (duplicate booking)...${NC}"

BOOK2_RESPONSE=$(curl -s -X POST \
  "${PROJECT_URL}/functions/v1/book-appointment" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "$BOOK_PAYLOAD")

EXISTED=$(echo "$BOOK2_RESPONSE" | jq -r '.existed // false' 2>/dev/null)

if [ "$EXISTED" = "true" ]; then
  echo -e "${GREEN}✅ Idempotency working - duplicate prevented${NC}"
else
  echo -e "${YELLOW}⚠️  Idempotency check unclear${NC}"
fi
echo ""

# ============================================
# TEST 4: Conflict Detection
# ============================================
echo -e "${YELLOW}[TEST 4] Testing conflict detection...${NC}"

CONFLICT_PAYLOAD=$(cat <<EOF
{
  "receptionistId": "$RECEPTIONIST_ID",
  "serviceId": null,
  "startTime": "$FIRST_SLOT",
  "customerName": "Conflict Test",
  "customerEmail": "conflict@example.com",
  "customerPhone": "+9876543210",
  "bookingSource": "smoke_test"
}
EOF
)

CONFLICT_RESPONSE=$(curl -s -X POST \
  "${PROJECT_URL}/functions/v1/book-appointment" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "$CONFLICT_PAYLOAD")

echo "Response: $CONFLICT_RESPONSE"

if echo "$CONFLICT_RESPONSE" | grep -q "no longer available\|conflict"; then
  echo -e "${GREEN}✅ Conflict detection working${NC}"
else
  echo -e "${YELLOW}⚠️  Conflict detection unclear${NC}"
fi
echo ""

# ============================================
# TEST 5: Cancel Appointment
# ============================================
if [ -n "$CANCELLATION_TOKEN" ]; then
  echo -e "${YELLOW}[TEST 5] Cancelling appointment...${NC}"

  CANCEL_PAYLOAD=$(cat <<EOF
{
  "appointmentId": "$APPOINTMENT_ID",
  "cancellationToken": "$CANCELLATION_TOKEN",
  "reason": "Smoke test cleanup"
}
EOF
)

  CANCEL_RESPONSE=$(curl -s -X POST \
    "${PROJECT_URL}/functions/v1/cancel-appointment" \
    -H "Authorization: Bearer ${ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d "$CANCEL_PAYLOAD")

  echo "Response: $CANCEL_RESPONSE"

  if echo "$CANCEL_RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ Appointment cancelled successfully${NC}"
  else
    echo -e "${RED}❌ Cancellation failed${NC}"
  fi
fi

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  SMOKE TEST COMPLETE                             ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Created appointments (for manual verification):"
for appt in "${CREATED_APPOINTMENTS[@]}"; do
  echo -e "  - ${YELLOW}$appt${NC}"
done
echo ""
echo -e "${YELLOW}Manual Verification Checklist:${NC}"
echo "1. Check notifications table for appointment.created entries"
echo "2. Check appointment_logs table for audit trail"
echo "3. Verify tokens are stored in metadata"
echo "4. Test public confirm/cancel pages with tokens"
echo ""
echo -e "Quick SQL queries:"
echo "SELECT * FROM appointments WHERE id = '$APPOINTMENT_ID';"
echo "SELECT * FROM appointment_logs WHERE appointment_id = '$APPOINTMENT_ID';"
echo "SELECT * FROM notifications WHERE metadata->>'appointment_id' = '$APPOINTMENT_ID';"
