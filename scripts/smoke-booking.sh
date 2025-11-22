#!/bin/bash
# Smoke test for AI booking flow

set -e

# Configuration
PROJECT_ID="xhihzexkqezhpwsryxqv"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoaWh6ZXhrcWV6aHB3c3J5eHF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2NjA0MTksImV4cCI6MjA3NjIzNjQxOX0.r6k7USvWZX-0A-yC11-tp0r3B9qVCX858Opja1ZWdIY"
BASE_URL="https://${PROJECT_ID}.supabase.co/functions/v1"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  AI BOOKING SMOKE TEST${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Prompt for required inputs
read -p "Enter receptionist ID: " RECEPTIONIST_ID
read -p "Enter user ID (or press enter for test user): " USER_ID
USER_ID=${USER_ID:-"test-user-$(date +%s)"}

echo ""
echo -e "${BLUE}Using:${NC}"
echo "  Receptionist ID: $RECEPTIONIST_ID"
echo "  User ID: $USER_ID"
echo ""

# Test 1: Natural language booking
echo -e "${BLUE}TEST 1: Natural language booking${NC}"
echo "Request: 'I want to book a haircut tomorrow at 3pm for John, my number is +234567890'"

RESPONSE=$(curl -s -X POST "${BASE_URL}/chat" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"messages\": [{\"role\": \"user\", \"content\": \"I want to book a haircut tomorrow at 3pm for John, my number is +234567890\"}],
    \"receptionistId\": \"${RECEPTIONIST_ID}\",
    \"userId\": \"${USER_ID}\"
  }")

echo "Response:"
echo "$RESPONSE" | jq '.'

if echo "$RESPONSE" | jq -e '.appointment.id' > /dev/null 2>&1; then
  APPOINTMENT_ID=$(echo "$RESPONSE" | jq -r '.appointment.id')
  echo -e "${GREEN}✓ TEST 1 PASSED: Appointment created with ID: $APPOINTMENT_ID${NC}"
else
  echo -e "${RED}✗ TEST 1 FAILED: No appointment created${NC}"
fi

echo ""
echo "---"
echo ""

# Test 2: Request unavailable time (should return alternatives)
echo -e "${BLUE}TEST 2: Unavailable time (should return alternatives)${NC}"
echo "Request: 'Book a massage for midnight tonight'"

RESPONSE2=$(curl -s -X POST "${BASE_URL}/chat" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"messages\": [{\"role\": \"user\", \"content\": \"Book a massage for midnight tonight\"}],
    \"receptionistId\": \"${RECEPTIONIST_ID}\",
    \"userId\": \"${USER_ID}-2\"
  }")

echo "Response:"
echo "$RESPONSE2" | jq '.'

if echo "$RESPONSE2" | jq -e '.alternatives' > /dev/null 2>&1; then
  ALT_COUNT=$(echo "$RESPONSE2" | jq '.alternatives | length')
  echo -e "${GREEN}✓ TEST 2 PASSED: Returned $ALT_COUNT alternatives${NC}"
else
  echo -e "${RED}✗ TEST 2 FAILED: No alternatives returned${NC}"
fi

echo ""
echo "---"
echo ""

# Test 3: Accept an alternative
echo -e "${BLUE}TEST 3: Accept alternative option${NC}"
echo "Request: 'accept_alternative:1'"

RESPONSE3=$(curl -s -X POST "${BASE_URL}/chat" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"messages\": [{\"role\": \"user\", \"content\": \"accept_alternative:1\"}],
    \"receptionistId\": \"${RECEPTIONIST_ID}\",
    \"userId\": \"${USER_ID}-2\"
  }")

echo "Response:"
echo "$RESPONSE3" | jq '.'

if echo "$RESPONSE3" | jq -e '.appointment.id' > /dev/null 2>&1; then
  APPOINTMENT_ID_2=$(echo "$RESPONSE3" | jq -r '.appointment.id')
  echo -e "${GREEN}✓ TEST 3 PASSED: Alternative booked with ID: $APPOINTMENT_ID_2${NC}"
else
  echo -e "${RED}✗ TEST 3 FAILED: Alternative not booked${NC}"
fi

echo ""
echo "---"
echo ""

# Cleanup prompt
echo -e "${BLUE}Smoke tests complete!${NC}"
echo ""
echo "Created appointments:"
if [ ! -z "$APPOINTMENT_ID" ]; then
  echo "  - $APPOINTMENT_ID"
fi
if [ ! -z "$APPOINTMENT_ID_2" ]; then
  echo "  - $APPOINTMENT_ID_2"
fi

echo ""
read -p "Clean up test appointments? (y/n): " CLEANUP

if [ "$CLEANUP" == "y" ]; then
  echo "Canceling test appointments..."
  # Note: This requires appointment-action function
  if [ ! -z "$APPOINTMENT_ID" ]; then
    curl -s -X POST "${BASE_URL}/appointment-action" \
      -H "Authorization: Bearer ${ANON_KEY}" \
      -H "Content-Type: application/json" \
      -d "{\"action\": \"cancel\", \"appointment_id\": \"${APPOINTMENT_ID}\"}" > /dev/null
    echo -e "${GREEN}✓ Canceled $APPOINTMENT_ID${NC}"
  fi
  
  if [ ! -z "$APPOINTMENT_ID_2" ]; then
    curl -s -X POST "${BASE_URL}/appointment-action" \
      -H "Authorization: Bearer ${ANON_KEY}" \
      -H "Content-Type": application/json" \
      -d "{\"action\": \"cancel\", \"appointment_id\": \"${APPOINTMENT_ID_2}\"}" > /dev/null
    echo -e "${GREEN}✓ Canceled $APPOINTMENT_ID_2${NC}"
  fi
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  TEST COMPLETE${NC}"
echo -e "${BLUE}========================================${NC}"
