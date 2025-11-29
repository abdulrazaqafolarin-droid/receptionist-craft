#!/usr/bin/env bash
# ============================================
# APPOINTMENT BOOKING SMOKE TEST  
# Tests complete booking flow end-to-end
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Appointment Booking Smoke Test${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check required environment variables
if [ -z "$SUPABASE_URL" ]; then
  echo -e "${RED}ERROR: SUPABASE_URL not set${NC}"
  echo "Usage: SUPABASE_URL=<url> SERVICE_ROLE_KEY=<key> ./scripts/smoke-test-booking.sh"
  exit 1
fi

if [ -z "$SERVICE_ROLE_KEY" ]; then
  echo -e "${RED}ERROR: SERVICE_ROLE_KEY not set${NC}"
  echo "Usage: SUPABASE_URL=<url> SERVICE_ROLE_KEY=<key> ./scripts/smoke-test-booking.sh"
  exit 1
fi

FUNCTIONS_URL="$SUPABASE_URL/functions/v1"

echo -e "${YELLOW}Enter Receptionist ID:${NC}"
read -r RECEPTIONIST_ID

if [ -z "$RECEPTIONIST_ID" ]; then
  echo -e "${RED}ERROR: Receptionist ID required${NC}"
  exit 1
fi

# Generate unique test IDs
USER_ID=$(uuidgen 2>/dev/null || python3 -c 'import uuid; print(uuid.uuid4())' 2>/dev/null || echo "test-user-$$")
USER_ID=$(echo "$USER_ID" | tr '[:upper:]' '[:lower:]')
echo -e "${GREEN}Test user ID: ${USER_ID}${NC}"
echo ""

# TEST 1: Check Availability
echo -e "${BLUE}TEST 1: Check Availability${NC}"

START_DATE=$(date -u +"%Y-%m-%d" 2>/dev/null || date +"%Y-%m-%d")
END_DATE=$(date -u -d "+7 days" +"%Y-%m-%d" 2>/dev/null || date -v+7d +"%Y-%m-%d" 2>/dev/null || date +"%Y-%m-%d")

AVAIL_RESPONSE=$(curl -s -X POST "$FUNCTIONS_URL/check-availability" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"receptionistId\": \"$RECEPTIONIST_ID\",
    \"startDate\": \"$START_DATE\",
    \"endDate\": \"$END_DATE\",
    \"maxSlots\": 5
  }")

echo "$AVAIL_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$AVAIL_RESPONSE"

SLOT=$(echo "$AVAIL_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('slots', [{}])[0].get('start', ''))" 2>/dev/null || echo "")

if [ -z "$SLOT" ]; then
  echo -e "${YELLOW}No slots, using fallback${NC}"
  SLOT=$(date -u -d "tomorrow 14:00" +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null || echo "2025-12-31T14:00:00.000Z")
fi

echo -e "${GREEN}✓ Using slot: ${SLOT}${NC}"
echo ""

# TEST 2: Book Appointment
echo -e "${BLUE}TEST 2: Book Appointment${NC}"

IDEMPOTENCY_KEY=$(uuidgen 2>/dev/null || python3 -c 'import uuid; print(uuid.uuid4())' 2>/dev/null || echo "test-$$")
IDEMPOTENCY_KEY=$(echo "$IDEMPOTENCY_KEY" | tr '[:upper:]' '[:lower:]')

BOOK_RESPONSE=$(curl -s -X POST "$FUNCTIONS_URL/book-appointment" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"receptionistId\": \"$RECEPTIONIST_ID\",
    \"serviceId\": null,
    \"startTime\": \"$SLOT\",
    \"customerName\": \"Test Customer\",
    \"customerEmail\": \"test@example.com\",
    \"customerPhone\": \"+1234567890\",
    \"source\": \"smoke_test\",
    \"metadata\": {
      \"idempotency_key\": \"$IDEMPOTENCY_KEY\",
      \"test_run\": true
    }
  }")

echo "$BOOK_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$BOOK_RESPONSE"

APPOINTMENT_ID=$(echo "$BOOK_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('appointment', {}).get('id', ''))" 2>/dev/null || echo "")
CANCELLATION_TOKEN=$(echo "$BOOK_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('appointment', {}).get('cancellation_token', ''))" 2>/dev/null || echo "")

if [ -z "$APPOINTMENT_ID" ]; then
  echo -e "${RED}✗ Failed to book${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Booked: ${APPOINTMENT_ID}${NC}"
echo ""

# TEST 3: Idempotency
echo -e "${BLUE}TEST 3: Idempotency${NC}"

IDEM_RESPONSE=$(curl -s -X POST "$FUNCTIONS_URL/book-appointment" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"receptionistId\": \"$RECEPTIONIST_ID\",
    \"serviceId\": null,
    \"startTime\": \"$SLOT\",
    \"customerName\": \"Test Customer\",
    \"customerEmail\": \"test@example.com\",
    \"customerPhone\": \"+1234567890\",
    \"source\": \"smoke_test\",
    \"metadata\": {
      \"idempotency_key\": \"$IDEMPOTENCY_KEY\",
      \"test_run\": true
    }
  }")

EXISTED=$(echo "$IDEM_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('existed', False))" 2>/dev/null || echo "false")

if [ "$EXISTED" == "True" ] || [ "$EXISTED" == "true" ]; then
  echo -e "${GREEN}✓ Idempotency working${NC}"
else
  echo -e "${YELLOW}⚠ existed=$EXISTED${NC}"
fi
echo ""

# TEST 4: Conflict Detection
echo -e "${BLUE}TEST 4: Conflict Detection${NC}"

NEW_IDEMPOTENCY=$(uuidgen 2>/dev/null || python3 -c 'import uuid; print(uuid.uuid4())' 2>/dev/null || echo "conflict-$$")
NEW_IDEMPOTENCY=$(echo "$NEW_IDEMPOTENCY" | tr '[:upper:]' '[:lower:]')

CONFLICT_RESPONSE=$(curl -s -X POST "$FUNCTIONS_URL/book-appointment" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"receptionistId\": \"$RECEPTIONIST_ID\",
    \"serviceId\": null,
    \"startTime\": \"$SLOT\",
    \"customerName\": \"Conflict Customer\",
    \"customerEmail\": \"conflict@example.com\",
    \"customerPhone\": \"+9876543210\",
    \"source\": \"smoke_test\",
    \"metadata\": {
      \"idempotency_key\": \"$NEW_IDEMPOTENCY\",
      \"test_run\": true
    }
  }")

CONFLICT_ERROR=$(echo "$CONFLICT_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('error', ''))" 2>/dev/null || echo "")

if [[ "$CONFLICT_ERROR" == *"no longer available"* ]] || [[ "$CONFLICT_ERROR" == *"conflict"* ]]; then
  echo -e "${GREEN}✓ Conflict detected${NC}"
else
  echo -e "${YELLOW}⚠ Unexpected: $CONFLICT_ERROR${NC}"
fi
echo ""

# TEST 5: Cancel Appointment
if [ -n "$CANCELLATION_TOKEN" ]; then
  echo -e "${BLUE}TEST 5: Cancel Appointment${NC}"

  CANCEL_RESPONSE=$(curl -s -X POST "$FUNCTIONS_URL/appointment-action" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"appointmentId\": \"$APPOINTMENT_ID\",
      \"action\": \"cancel\",
      \"cancellationToken\": \"$CANCELLATION_TOKEN\",
      \"reason\": \"Smoke test cleanup\"
    }")

  echo "$CANCEL_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$CANCEL_RESPONSE"

  CANCEL_SUCCESS=$(echo "$CANCEL_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('success', False))" 2>/dev/null || echo "false")

  if [ "$CANCEL_SUCCESS" == "True" ] || [ "$CANCEL_SUCCESS" == "true" ]; then
    echo -e "${GREEN}✓ Cancelled${NC}"
  else
    echo -e "${RED}✗ Failed to cancel${NC}"
  fi
else
  echo -e "${YELLOW}⚠ Skipping cancel (no token)${NC}"
fi
echo ""

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Test Complete${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${GREEN}Created: ${APPOINTMENT_ID}${NC}"
echo ""
echo -e "${YELLOW}Verification:${NC}"
echo "SELECT * FROM appointments WHERE id = '$APPOINTMENT_ID';"
echo "SELECT * FROM appointment_logs WHERE appointment_id = '$APPOINTMENT_ID';"
echo "SELECT * FROM notifications WHERE metadata->>'appointment_id' = '$APPOINTMENT_ID';"
echo ""
echo -e "${GREEN}✓ Smoke test complete${NC}"
