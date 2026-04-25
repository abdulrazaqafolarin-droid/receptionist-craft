#!/usr/bin/env bash
set -euo pipefail

PROJECT_REF="${PROJECT_REF:-esvrhnlwquunsdduvbnr}"
ANON_KEY="${ANON_KEY:-}"
RECEPTIONIST_ID="${RECEPTIONIST_ID:-}"
BASE_URL="https://${PROJECT_REF}.supabase.co/functions/v1"

if [[ -z "$ANON_KEY" ]]; then
  echo "ERROR: Set ANON_KEY env var (Supabase publishable/anon key)."
  exit 1
fi

if [[ -z "$RECEPTIONIST_ID" ]]; then
  echo "ERROR: Set RECEPTIONIST_ID env var for a live receptionist."
  exit 1
fi

SESSION_ID="smoke-$(date +%s)"

call_widget() {
  local message="$1"
  curl -sS "$BASE_URL/widget-chat" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ANON_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"receptionistId\":\"$RECEPTIONIST_ID\",\"sessionId\":\"$SESSION_ID\",\"source\":\"widget\",\"message\":\"$message\"}"
}

echo "[1/4] greeting-store" >&2
RESP1="$(call_widget "")"
echo "$RESP1" | head -c 300; echo

echo "[2/4] initial user message" >&2
RESP2="$(call_widget "Hello, I'd like to book an appointment")"
echo "$RESP2" | head -c 500; echo

echo "[3/4] follow-up message" >&2
RESP3="$(call_widget "Tomorrow afternoon works")"
echo "$RESP3" | head -c 500; echo

echo "[4/4] state continuity check" >&2
RESP4="$(call_widget "My name is Smoke Test")"
echo "$RESP4" | head -c 500; echo

if echo "$RESP2$RESP3$RESP4" | rg -q '"reply"'; then
  echo "PASS: widget-chat returned replies across multi-turn smoke flow"
else
  echo "FAIL: widget-chat did not return expected reply payload"
  exit 1
fi
