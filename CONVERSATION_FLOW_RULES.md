# Conversation Flow Rules

Generated from full system audit. Every conversational instruction found in the codebase is categorized below.

---

## Governing Principle

> A flow instruction may only guide the next AI response. It may never cause the AI to ignore what the customer said. The customer's message always gets acknowledged first.

---

## REMOVE — Actively harmful, eliminates human-like behavior

### R1 — Topic lock redirect without answering
- **Source:** `stateMachine.ts` `getRedirectMessage()`
- **Current behavior:** "Let's get back to booking your appointment" — ignores customer's actual question
- **Replacement:** Remove topic lock entirely. If the customer asks a side question, answer it briefly, then return to the flow.

### R2 — "Lock topic when active" hard block
- **Source:** `flow/conversationGovernor.ts` `buildGovernorPrompt()` rule 6
- **Current behavior:** The AI refuses to discuss anything outside the current booking/order flow
- **Replacement:** The AI may answer brief off-topic questions. If the customer goes off-topic 3+ consecutive times, the flow should unlock entirely.

### R3 — Fixed-order slot collection without flexibility
- **Source:** `engine/governor.ts` `generateInstruction()` switch statement
- **Current behavior:** Each step allows exactly one action (service → date → time → name → phone)
- **Replacement:** Allow ANY field to be collected in any order. Check what was already provided before deciding what to ask for.

### R4 — "If the customer does not provide X, ask again" without escape
- **Source:** Multiple locations in `widget-chat/index.ts` `buildMasterSystemPrompt()` and `engine/governor.ts`
- **Current behavior:** The AI keeps asking for the same field until the customer provides it or leaves
- **Replacement:** After 2 attempts, allow the AI to say "No problem, we can proceed without it" or offer a different approach.

---

## SOFTEN — Needed but should not override customer input

### S1 — Booking flow redirect
- **Source:** `stateMachine.ts` `getRedirectMessage()`
- **Current instruction:** "We'll get back to your [task]. Let me help you with [topic]."
- **Softened version:** "Sure! [Brief answer to their question]. Now, back to [booking/order] — [next question]?"
- **Exception:** If the customer's off-topic question is urgent (frustrated/emergency signals), drop the flow and handle the question first.

### S2 — Summarize before confirming
- **Source:** `widget-chat/index.ts` `buildMasterSystemPrompt()` booking protocol
- **Current instruction:** "Before confirming, ALWAYS repeat the full booking summary and ask to confirm."
- **Softened version:** "Summarize before confirming at most once per task. If the customer already said yes, proceed to confirmation. Only re-summarize if the customer asks 'what did I book?'"
- **Exception:** If the customer changes any detail, summarize with the new details and ask for reconfirmation.

### S3 — "Never re-greet"
- **Source:** Multiple files (layer6-safety, engine/governor, widget-chat prompt)
- **Current instruction:** "NEVER re-greet the customer after the first turn."
- **Softened version:** "Do not re-greet within the same session. If the customer returns after a long pause (>30 minutes) and greets you first, you may acknowledge their return warmly without a full re-introduction. Never initiate a re-greeting yourself."
- **Exception:** Customer returns after 30+ minutes and greets first.

### S4 — "Only ask one missing field at a time"
- **Source:** `flow/conversationGovernor.ts`, `engine/governor.ts`
- **Current instruction:** "Only ask for ONE missing field per response. Never ask for multiple."
- **Softened version:** "Ask for one missing field at a time by default. However, if the customer provides multiple fields at once, acknowledge all provided fields and only ask for what's truly missing. Never ignore volunteered information."
- **Exception:** Customer provides multiple fields in one message.

### S5 — "I'm sorry to hear that" — max once per session
- **Source:** `layers/layer6-safety.ts`
- **Current instruction:** "Use 'I'm sorry to hear that' at most once per session."
- **Softened version:** "Each empathy phrase should be used at most once per session. Vary your expressions of empathy: 'I understand', 'That must be frustrating', 'I hear you', 'Let me help with that'."
- **Exception:** Sincere empathy for new issues should not be blocked by a counter.

### S6 — Action gate blocking without clear user intent
- **Source:** `actionGate.ts`
- **Current instruction:** "All actions blocked unless all required slots filled AND user explicitly confirmed."
- **Softened version:** "Actions are blocked by default. However, if the user has clearly confirmed intent (e.g., 'Yes, please book it'), AND only non-critical fields are missing, proceed with confirmation and note what's missing. For missing critical fields (phone, date, service), always collect first."
- **Exception:** Only critical fields (phone, date, service for booking; product, contact for order) must be confirmed before proceeding.

---

## CONDITIONALIZE — Add conditions and escape hatches

### C1 — Flow lock release after repeated off-topic queries
- **Source:** `flow/conversationGovernor.ts`
- **Condition:** If the customer asks 3+ off-topic questions consecutively, the flow lock should release. This signals the customer has changed their mind.
- **Action:** Unlock current flow, mark ActiveTask as abandoned, save collected fields for later resume.

### C2 — "Stay on booking flow" with exception for urgent/emotional customers
- **Source:** Multiple prompt files
- **Condition:** If emotional state = frustrated or urgent (detected by empathy.ts signals), pause the flow and address the emotional need first.
- **Action:** Respond to the emotional content first. After resolution, offer to return to the flow.

### C3 — Confirmation re-send only when customer changes details
- **Source:** `engine/governor.ts` forbidden list
- **Condition:** `re-confirm` is currently forbidden after confirmation is sent. Allow re-confirmation IF the customer has changed or modified a previously confirmed detail.
- **Action:** If customer says "actually, change the time to 4pm", re-summarize with the change and ask for re-confirmation.

### C4 — Name collection with "skip if known" exception
- **Source:** `nameValidator.ts`, `actionGate.ts`
- **Condition:** If the customer is a repeat visitor (same session_id, previous conversation history with name), the name requirement can be relaxed.
- **Action:** Check if name exists in conversation_summaries or previous EngineState slots. If known, skip re-collection.

---

## KEEP — Essential and working correctly

### K1 — Never invent prices, hours, stock, or policies
**Source:** `hallucinationGuard.ts`
**Why kept:** Core trust mechanism. Without this, the AI could quote wrong prices or promise unavailable services.

### K2 — Safety classifier (jailbreak, harmful content, PII)
**Source:** `layers/layer6-safety.ts`, `widget-chat/index.ts` `runSafetyClassifier()`
**Why kept:** Essential security layer. Blocks XSS, prompt injection, and data extraction attempts.

### K3 — Rate limiting (30 msg/min per session)
**Source:** `rateLimiter.ts`
**Why kept:** Abuse protection. Prevents bot attacks and runaway conversations.

### K4 — Session-isolated RLS via x-session-id
**Source:** DB policies, widget-chat header injection
**Why kept:** Multi-tenant security. Prevents one customer from seeing another's data.

### K5 — Greeting suppression after first turn
**Source:** `layer6-safety.ts`, engine governor
**Why kept:** Prevents repetitive "Hello! How can I help you?" behavior.

### K6 — Empathy non-repetition
**Source:** `layers/layer6-safety.ts` empathy episode rule
**Why kept:** Prevents robotic-sounding repeated sympathy.

### K7 — Name validator rejection of greetings/pronouns/sentences
**Source:** `nameValidator.ts`
**Why kept:** Prevents name fields from being populated with "My name is John" (the whole sentence) or "hi" (a greeting). 120+ word blocklist catches edge cases.

### K8 — Stock validation before order confirmation
**Source:** `inventoryValidator.ts`
**Why kept:** Prevents selling out-of-stock items. Respects low-stock thresholds.

### K9 — Action gate requiring contact info for booking
**Source:** `actionGate.ts`
**Why kept:** Prevents ghost bookings. Without a phone/email, there's no way to confirm or remind.

### K10 — Date/time validation against business hours
**Source:** `bookingValidator.ts`
**Why kept:** Prevents booking outside of operating hours.

### K11 — Currency and timezone from business config
**Source:** `widget-chat/index.ts` `buildKnowledgeBase()`
**Why kept:** Prevents pricing errors across different regions.

### K12 — Input sanitization (strip HTML, length limit)
**Source:** `widget-chat/index.ts` `sanitizeInput()`
**Why kept:** Security — prevents XSS and prompt injection through user input.

### K13 — AI response quality evaluation
**Source:** `layers/layer6-safety.ts` `evaluateResponseQuality()`
**Why kept:** Catches incoherent, robotic, or inappropriate responses. Threshold >= 4.0/7.0.

### K14 — First message greeting with business identity
**Source:** `layers/layer1-identity.ts`
**Why kept:** Sets the right first impression. Includes business name, receptionist name, and warm opening.

---

## Summary

| Category | Count | Instructions |
|----------|-------|-------------|
| REMOVE | 4 | R1, R2, R3, R4 |
| SOFTEN | 6 | S1, S2, S3, S4, S5, S6 |
| CONDITIONALIZE | 4 | C1, C2, C3, C4 |
| KEEP | 14 | K1 through K14 |

**Total: 28 instructions analyzed**

---

*Generated from full system audit — see ai-brain/ROADMAP.md for complete defect matrix*
