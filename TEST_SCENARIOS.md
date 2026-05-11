# Test Scenarios

Generated from full system audit. All test scenarios for fixes and edge cases.

---

## SCENARIO GROUPS

1. **Conversational Flow Fixes** — Tests for REMOVE/SOFTEN/CONDITIONALIZE instruction changes
2. **UI Overlap Fixes** — Tests for dual UI system consolidation
3. **Engine Unification** — Tests for single engine migration
4. **State Unification** — Tests for consolidated state system
5. **Revenue Tracking** — Tests for money mode and analytics
6. **Foresight** — Tests for edge cases that will break at scale

---

## SCENARIO 1: Answer-first redirect (tests R1 fix)

**Type:** Integration
**Setup:**
- Receptionist with service booking capability
- Widget session active
- Customer is in booking flow (collecting time)
- Customer asks: "By the way, what time do you close today?"

**Expected:**
- AI answers the time question directly from knowledge base
- AI then says something like "Now, back to booking — what time works for you?"
- One turn handles both the question and the redirect

**Not-expected:**
- AI says "Let's get back to booking your appointment" without answering
- AI ignores the question entirely
- AI loses the booking flow state

**Covers defect:** Finding #1 (stateMachine redirect)

---

## SCENARIO 2: Multi-slot acceptance (tests R3 fix)

**Type:** Integration
**Setup:**
- Receptionist with service booking capability
- Customer says: "My name is Jane, I want to come in Thursday for a haircut at 2pm"

**Expected:**
- AI acknowledges: "Thanks Jane! A haircut on Thursday at 2pm — great choice."
- AI identifies missing fields: phone number
- AI asks only for the phone number
- No re-asking of service, date, time, or name

**Not-expected:**
- AI asks "What service would you like?" (ignoring provided service)
- AI asks "What date works best?" (ignoring provided date)
- AI re-asks for name

**Covers defect:** Finding #2, #8 (governor switch, layer5 slot order)

---

## SCENARIO 3: Two-attempt escape (tests R4 fix)

**Type:** Integration
**Setup:**
- Customer in booking flow
- AI asks for phone number
- Customer says "I don't have my phone right now"
- AI asks again for phone number
- Customer says "I really don't have it"

**Expected (after R4 fix):**
- After 2 failed attempts to collect phone, AI says something like:
  "No problem! Let me go ahead and book it for you, and you can provide your number when you come in."
- Booking proceeds without phone number (with flag: `contact_missing: true`)

**Not-expected:**
- AI asks a third time for phone number
- Conversation deadlocks
- Customer leaves frustrated

**Covers defect:** Finding #4 (forced repetition without escape)

---

## SCENARIO 4: Off-topic unlocking after 3 consecutive (tests C1 fix)

**Type:** Integration
**Setup:**
- Customer in booking flow (selecting service)
- Customer asks: "What are your hours?" (off-topic)
- AI answers briefly, redirects to booking
- Customer asks: "What's your address?" (off-topic)
- AI answers briefly, redirects to booking
- Customer asks: "Do you have parking?" (off-topic)

**Expected (after C1 fix):**
- After 3rd off-topic question, AI answers the question
- AI says something like: "You seem to have other questions. Would you like to continue with the booking later, or is there something else I can help with?"
- Flow lock releases
- Partial booking state saved for resume

**Not-expected:**
- AI keeps redirecting "Let's get back to booking" on the 4th+ off-topic message
- Booking state is lost

**Covers defect:** Finding #3, #5 (topic lock, hard block)

---

## SCENARIO 5: Confirmation without re-summarize (tests S2 fix)

**Type:** Integration
**Setup:**
- AI has presented booking summary: "So that's a haircut on Thursday at 2pm. Shall I book it?"
- Customer says: "Yes, that's correct"

**Expected (after S2 fix):**
- AI proceeds directly to confirmation
- AI says: "Perfect! Your haircut is booked for Thursday at 2pm. You'll receive a confirmation shortly."
- Booking is created in DB

**Not-expected:**
- AI says "Let me confirm: you want a haircut on Thursday at 2pm with us, correct?" (re-confirming after confirm)
- Double booking

**Covers defect:** Finding #7 (loop-causing confirmation)

---

## SCENARIO 6: Dual UI conflict (tests UI consolidation)

**Type:** E2E (widget rendering)
**Setup:**
- Send a message that triggers `intentSignal.activeComponent = "booking_confirm"`
- AND `signal.activeComponent = "booking_confirmation"`
- (Simulate the AI response that A/B testers would trigger)

**Expected (after fix — one canonical UI manager):**
- Exactly ONE booking confirmation renders
- No duplicate panels
- No overlapping elements

**Not-expected:**
- Two booking confirmation cards visible
- SuggestionButton AND LauncherButton both visible
- User confusion

**Covers defect:** C5 (Dual UI systems)

---

## SCENARIO 7: Lead_form renders correctly (tests orphan component fix)

**Type:** E2E
**Setup:**
- AI sends `activeComponent: "lead_form"`
- Customer taps the triggered button

**Expected:**
- Lead form renders with customer_fields from receptionist config
- Fields match the configured order
- Submit sends data to parent

**Not-expected:**
- "lead_form" maps to null component — nothing renders
- User sees button but tapping does nothing

**Covers defect:** Orphan paths (lead_form, switch_confirmation)

---

## SCENARIO 8: Empty availability graceful handling (tests 11G)

**Type:** Integration
**Setup:**
- Receptionist has no available slots for 30 days
- Customer asks: "Can I book an appointment?"

**Expected:**
- AI says: "I'm sorry, it looks like we're fully booked for the next few weeks. Would you like me to check further out, or take your contact info so we can notify you when a slot opens?"
- UI shows "No available slots" message (already implemented in TimeSlotSelector)
- Customer can choose to provide contact for waitlist

**Not-expected:**
- AI asks "What time works for you?" then fails
- UI shows empty time slot grid with no message
- Flow deadlocks

**Covers defect:** 11G (Empty availability)

---

## SCENARIO 9: Double-tap idempotency (tests M1 fix)

**Type:** Integration
**Setup:**
- Customer confirms booking
- Network sends two rapid confirmation requests (race condition / double-tap)
- Both requests arrive at edge function

**Expected (after idempotency fix):**
- First request creates booking
- Second request detects duplicate via `(session_id, service_id, date, time)` unique constraint
- Second request returns "already booked" without creating duplicate
- Only one appointment in DB

**Not-expected:**
- Two identical appointments created
- Customer charged twice
- Double confirmation email sent

**Covers defect:** M1 (No idempotency), 11F (Booking double-submission)

---

## SCENARIO 10: Deleted service mid-booking (tests 11H fix)

**Type:** Integration
**Setup:**
- Customer selects a service
- Before customer confirms, business owner deletes the service from dashboard
- Customer says "Yes, confirm my booking"

**Expected:**
- At confirmation time, system validates service_id exists in services table
- Service not found → AI says: "I'm sorry, it looks like [service name] is no longer available. Would you like to choose a different service?"
- No appointment created with invalid service_id

**Not-expected:**
- Appointment created with null service_id (FK constraint violation)
- Edge function crashes with 500
- AI says "Booking confirmed!" but nothing happens
- Customer sees success but no actual booking

**Covers defect:** 11H (Deleted service mid-booking)

---

## SCENARIO 11: Conversation memory restoration after widget reopen (tests C4, 11B, 11C)

**Type:** E2E
**Setup:**
- Customer in mid-booking (has selected service and date, hasn't confirmed)
- Customer closes widget (doesn't dismiss, just closes the browser tab)
- 2 hours later, customer reopens widget on the same device (same session_id, within 24h)

**Expected:**
- Widget restores full conversation with all chat messages visible
- State shows the customer was in mid-booking with service and date selected
- AI says: "Welcome back! You were booking a [service] for [date]. Shall we continue?"
- Time slot from 2 hours ago is re-validated (still available? if yes, proceed; if not, suggest alternatives)

**Not-expected:**
- Fresh start — no context of previous conversation
- AI asks for service again (was already provided)
- Stale time slot is used without re-validation
- Widget shows different UI state than conversation history

**Covers defect:** C4 (State fragmentation), 11B (Memory limit), 11C (Slot staleness)

---

## SCENARIO 12: Money mode dynamic activation (tests R2 fix)

**Type:** Integration
**Setup:**
- Receptionist has `money_mode_enabled: false`
- Customer shows high purchase intent: "I really want to buy a massage package. What do you have?"
- `computeIntentScore()` returns 0.82 (above threshold)

**Expected (after R2 fix):**
- Money Mode activates dynamically despite the manual toggle being off
- AI behavior shifts: more suggestive, recommends specific package, uses assumptive language
- "Our Relaxation Package is our most popular — 3 sessions for $150. Would you like to start with that?"

**Not-expected:**
- AI stays in passive mode: "Here are our massage packages. Let me know if you're interested in any."
- Money Mode only works when owner manually toggles it

**Covers defect:** R2 (Money Mode not dynamic), 11E (Money Mode × flow conflict)

---

## SCENARIO 13: AI API failure fallback (tests M4 fix)

**Type:** Integration
**Setup:**
- Gemini API returns 429 (rate limited)
- Circuit breaker is open (3 failures already)
- Customer sends a message

**Expected (after M4 fix):**
- Edge function detects circuit is open
- Falls back to rule-based response: "I'm sorry, our AI system is temporarily unavailable. Please call us at [phone number] or try again in a few minutes."
- Falls back to FAQ-based response if a direct FAQ match exists
- No "AI is thinking..." spinner indefinitely
- Error is logged to conversation_events

**Not-expected:**
- Widget shows infinite loading
- Edge function times out (30s)
- Customer sees blank/error page

**Covers defect:** M4 (No AI failure fallback), 11I (AI response timeout)

---

## SCENARIO 14: Revenue attribution with actual values (tests R3 fix)

**Type:** Unit
**Setup:**
- Customer books a service priced at $150
- Confirmation creates a conversion_event

**Expected (after R3 fix):**
- Conversion event has `estimated_value = 150` (actual service price)
- Revenue attribution view shows $150 (not avg_booking_value constant)

**Not-expected:**
- Conversion event has `estimated_value = avg_booking_value` (constant, e.g., $75)
- Revenue dashboard shows inaccurate data

**Covers defect:** R3 (Revenue estimation too basic)

---

## SCENARIO 15: Intent signal missing — graceful fallback (tests 11J fix)

**Type:** Unit
**Setup:**
- Edge function returns a response without `intentSignal` or `signal` fields
- (Simulate fallback or error path)

**Expected:**
- WidgetUIManager receives null intentSignal → renders nothing → chat continues as text-only
- UISignalRenderer receives null signal → renders nothing → chat continues as text-only
- No crash, no error, no blank page
- Chat messages still render normally

**Not-expected:**
- Component crashes with "Cannot read properties of null"
- Widget freezes
- Error state with no recovery

**Covers defect:** 11J (Intent signal missing)

---

## SCENARIO 16: Two widget instances on same page (tests 11D fix)

**Type:** E2E
**Setup:**
- Business owner embeds two widget instances on the same page (two different receptionists)
- Customer opens both widgets
- Customer sends messages in both

**Expected:**
- Each widget has independent state (session_id isolation)
- Messages in widget A don't appear in widget B
- UI components in widget A don't affect widget B
- No React context bleeding

**Not-expected:**
- Messages cross-talk between widgets
- UI components from widget A render in widget B
- State from one widget affects the other

**Covers defect:** 11D (Multi-receptionist edge case), 11A (Session isolation)

---

## SCENARIO 17: Rapid signal dismissal race (tests 11K fix)

**Type:** Integration
**Setup:**
- Network burst causes two AI responses to arrive within 100ms
- First response: `activeComponent: "service_selector", dismissPrevious: false`
- Second response: `activeComponent: "datetime_picker", dismissPrevious: true`

**Expected (after 11K fix):**
- Service selector is shown briefly
- When datetime_picker arrives, service selector is cleanly dismissed
- Datetime_picker renders without stale component data
- No visual artifacts or double-render

**Not-expected:**
- Both components render simultaneously
- Service selector is dismissed but leaves behind empty container
- Datetime_picker uses stale data from service_selector's componentData
- `processingDismiss` ref blocks legitimate dismissal

**Covers defect:** 11K (Dismiss signal race), C5 (Dual UI systems)

---

## SCENARIO 18: Product vs service disambiguation (tests C6 fix)

**Type:** Integration
**Setup:**
- Receptionist sells both services (haircuts) and products (shampoo bottles)
- Customer says: "I want a shampoo"

**Expected (after C6 fix):**
- Entity extractor correctly identifies "shampoo" as a product (is_product: true)
- Intent is classified as "order_product"
- AI shows product selector with shampoo bottles
- AI doesn't ask for appointment time

**Not-expected:**
- Entity extractor fails to find "shampoo" because it's in products array but not services array
- Intent is classified as "book_appointment"
- AI asks "What time would you like to come in for your shampoo?" (confused)

**Covers defect:** C6 (Product/service entity confusion)

---

## SCENARIO 19: Empathy non-repetition with varied phrasing (tests K6)

**Type:** Unit
**Setup:**
- Customer expresses frustration at turn 5: "This is terrible"
- AI responds: "I'm sorry to hear that. Let me help."
- Customer expresses frustration at turn 10: "This is still not working"
- Customer expresses frustration at turn 15: "I'm really upset now"

**Expected:**
- Turn 5: "I'm sorry to hear that" ✓ (first use allowed)
- Turn 10: "I understand your frustration. Let me look into this." ✓ (different phrase)
- Turn 15: "I hear you, and I want to make this right." ✓ (different phrase again)
- Each empathy phrase is used at most once per session

**Not-expected:**
- "I'm sorry to hear that" used at all 3 frustration points
- Any empathy phrase repeated verbatim
- No empathy because of counter mechanism preventing ALL empathy (blocker bug)

**Covers defect:** K6 (empathy non-repetition), S5 (softened version)

---

## Test Coverage Summary

| Scenario | Type | Defects Covered | Category |
|----------|------|----------------|----------|
| 1 | Integration | R1, Finding #1 | Flow fix |
| 2 | Integration | R3, Finding #2, #8 | Flow fix |
| 3 | Integration | R4, Finding #4 | Flow fix |
| 4 | Integration | C1, Finding #3, #5 | Flow fix |
| 5 | Integration | S2, Finding #7 | Flow fix |
| 6 | E2E | C5 | UI fix |
| 7 | E2E | Orphan paths | UI fix |
| 8 | Integration | 11G | Foresight |
| 9 | Integration | M1, 11F | Engine fix |
| 10 | Integration | 11H | Foresight |
| 11 | E2E | C4, 11B, 11C | State fix |
| 12 | Integration | R2, 11E | Revenue fix |
| 13 | Integration | M4, 11I | Reliability |
| 14 | Unit | R3 | Revenue fix |
| 15 | Unit | 11J | Reliability |
| 16 | E2E | 11D, 11A | Foresight |
| 17 | Integration | 11K, C5 | UI fix |
| 18 | Integration | C6 | Engine fix |
| 19 | Unit | K6, S5 | Flow fix |

**Total test scenarios: 19**
- Integration: 10
- E2E: 5
- Unit: 3
- Mixed: 1

**Coverage:** All 17 defects + 11 foresight items addressed
