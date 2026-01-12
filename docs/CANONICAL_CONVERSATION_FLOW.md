# 🧭 CANONICAL AI RECEPTIONIST CONVERSATION FLOW

## Complete Flow Documentation

This document defines the canonical conversation flow for the AI receptionist system, serving as the single source of truth for all conversation logic.

---

## 🟢 PHASE 0 — SESSION INITIALIZATION (HIDDEN)

**Purpose**: Set invariant rules.

- Create / retrieve session ID
- Load business context
- Load memory summary from `conversation_summaries` table
- Lock greeting rules
- Initialize conversation state in `conversation_state` table

📌 **User never sees this.**

---

## 🟢 PHASE 1 — GREETING (ONCE ONLY)

**Entry Condition**: First message in session (`isFirstMessage = true`)

**AI Action**:
- Greet warmly using business greeting message
- Offer help
- Store greeting in `chat_messages`

**Exit Condition**:
- User responds with anything

🔒 **Rule**: Never re-enter this phase. Enforced at 3 levels:
1. **Database**: Check existing messages by session_id
2. **Backend**: `isFirstMessage` boolean invariant
3. **Prompt**: Explicit NON-NEGOTIABLE rule in system prompt

---

## 🟡 PHASE 2 — DISCOVERY (DEFAULT STATE)

This is the resting state.

**AI goal**: Understand why the user is here

**Possible user intents**:
- Ask a question
- Start booking
- Complain
- Small talk
- Ask for price/hours/location

**AI behavior**:
- Answer directly if possible
- Ask ONE clarifying question if needed
- Detect booking intent early

📌 The AI may stay here indefinitely.

---

## 🔵 PHASE 3 — TASK COMMITMENT (INTENT LOCK)

**Entry Condition**: Clear intent detected (e.g., booking, ordering)

**Behavior**:
- Lock into appropriate flow (SERVICE or PRODUCT)
- Begin slot collection
- Track progress in `conversation_state.slots`

---

## 📊 HIGH-LEVEL STATE DIAGRAM

```
[ Session Initialized ]
          |
          v
[ Greeting (ONCE) ]
          |
          v
[ Intent Detection ]
          |
          +-----------------------------+
          |                             |
          v                             v
[ Booking / Ordering Flow ]      [ FAQ / Info Flow ]
          |                             |
          v                             v
[ Contact Collection ]           [ Answer Provided ]
          |                             |
          v                             |
[ Confirmation (ONCE) ] <--------------+
          |
          v
[ Execution ]
          |
          v
[ Conclusion ]
          |
          v
[ Session Idle / Await New Intent ]
```

---

## 🧭 DETAILED FLOW DIAGRAMS

### 1️⃣ Session Initialization (Hidden State)

```
Widget Load
   ↓
Generate / Retrieve session_id
   ↓
Fetch receptionist config
   ↓
Fetch memory summary (from conversation_summaries)
   ↓
Load conversation_state
   ↓
Lock greeting rules
```

**Invariants**:
- `session_id` is immutable
- greeting flag is persisted in `conversation_state.slots.greeting_sent`
- memory is loaded before AI responds

### 2️⃣ Greeting State (ONCE-ONLY STATE)

```
IF no prior messages in this session
   → Send greeting
   → Store greeting message
   → Mark greeting_sent = true
ELSE
   → Skip greeting
```

**Hard Rules**:
- Cannot be re-entered
- Acknowledgments do NOT trigger greeting
- Empty-message greeting storage is allowed once

### 3️⃣ Intent Detection (Always-On Router)

```
User Message
   ↓
Safety Check (Layer 6)
   ↓
Intent Classifier (17 intents)
   ↓
Topic Shift Detection
   ↓
Dialog Act Resolver
   ↓
Route to Correct Flow
```

**Important**:
- Intent detection runs on every message
- But does NOT reset flow unless intent changes
- Topic shifts are blocked during critical steps

---

## 🧭 SERVICE BOOKING FLOW

```
[ Booking Intent Detected ]
          |
          v
[ Select Service ] → ServiceSelector UI
          |
          v
[ Select Date ] → DateSelector UI
          |
          v
[ Select Time ] → TimeSlotSelector UI
          |
          v
[ Collect Contact Info ]
          |
          v
[ Booking Confirmation ] → BookingConfirmation UI
          |
          v
[ Execute Booking ] → book-appointment function
```

**Slot-Filling Rules (Critical)**:
- Slots can be filled via UI or natural language
- Slots can be filled in ANY order
- Already-filled slots are NEVER re-asked
- Corrections update slots in-place via `slotExtractor`

---

## 🧭 PRODUCT ORDER FLOW

```
[ Order Intent Detected ]
          |
          v
[ Select Product ] → ProductSelector UI
          |
          v
[ Select Quantity ]
          |
          v
[ Collect Contact Info ]
          |
          v
[ Order Confirmation ] → OrderConfirmation UI
          |
          v
[ Create Order ] → Insert to orders table
```

**Note**:
- Shares Contact + Confirmation + Execution modules with booking
- Includes inventory validation
- Checks stock before confirming

---

## 🧭 FAQ / INFO FLOW

```
[ Info Intent ]
     ↓
Check Knowledge Base (RAG)
     ↓
Grounded Answer
     ↓
Offer Next Help (ONCE)
```

**Rules**:
- No hallucination
- No upsell unless relevant
- No forced booking

---

## 🧭 CONCLUSION CONTRACT (VERY IMPORTANT)

```
Task Completed
     ↓
Confirm Success (ONCE)
     ↓
Ask "Anything else?" (ONCE)
     ↓
User Declines
     ↓
Professional Sign-off
```

🔒 **Conclusion Invariants**:
- Confirmation happens exactly once
- "Anything else?" happens once per resolved task
- No re-greeting
- No looping

---

## 🧠 ADAPTIVE BEHAVIOR

The flow is **state-based**, not linear.

**The AI can**:
- Jump into booking flow mid-sentence
- Pause booking to answer a question
- Resume booking without restarting
- Repair incorrect slots
- Escalate at any point

**But it can NEVER**:
- Forget where it is
- Restart the conversation
- Re-greet
- Skip confirmation
- Execute without user consent

---

## 🛡️ HARD INVARIANTS (NON-NEGOTIABLE)

These are system laws that override ALL code, prompts, and models:

1. **Greeting = ONCE per session**
2. **Booking confirmation = ONCE per transaction**
3. **AI may NEVER invent services, prices, or availability**
4. **AI must ask ONE clarification at a time**
5. **Acknowledgments never restart flow**
6. **Safety overrides everything**
7. **Conversation always returns to LISTENING after resolution**
8. **Human escalation halts AI autonomy**
9. **Conversation structure is deterministic; content is adaptive**
10. **No prompt may bypass this contract**

---

## 🧩 STATE → PROMPT → CODE MAPPING TABLE

| State | Prompt Block | Allowed Actions | Forbidden Actions | Exit Condition |
|-------|--------------|-----------------|-------------------|----------------|
| INIT | Identity + Greeting Rules | Greet once | Re-greet | Greeting stored |
| LISTENING | Intent Engine | Detect intent | Guess intent | Intent classified |
| BOOK_SERVICE | Booking Step Prompt | Ask service | Ask date/time | Service selected |
| BOOK_DATE | Date Prompt | Ask date | Ask contact | Date chosen |
| BOOK_TIME | Time Prompt | Check availability | Assume time | Slot selected |
| COLLECT_CONTACT | Contact Prompt | Ask name/contact | Skip contact | Contact captured |
| CONFIRM_BOOKING | Summary Prompt | Confirm once | Re-confirm | User confirms |
| FAQ | RAG Prompt | Answer from KB | Guess answer | Answer delivered |
| ACK | Micro-response Prompt | Short reply | Ask new question | None |
| ESCALATION | Escalation Prompt | Hand-off | Continue AI | Human takeover |
| CLOSING | Conclusion Prompt | Sign-off | Restart chat | Session end |

---

## 📁 Module Architecture

```
supabase/functions/
├── widget-chat/index.ts          # Main orchestrator
├── _shared/
│   ├── flow/                     # Unified Flow Engine
│   │   ├── index.ts              # Main export
│   │   ├── types.ts              # Type definitions
│   │   ├── stateManager.ts       # State persistence
│   │   ├── flowRouter.ts         # Intent routing
│   │   ├── slotExtractor.ts      # Slot extraction
│   │   └── memorySummarizer.ts   # Long-term memory
│   ├── layers/                   # 7-Layer Architecture
│   │   ├── layer1-identity.ts    # Core identity
│   │   ├── layer2-knowledge.ts   # RAG knowledge
│   │   ├── layer3-memory.ts      # Context memory
│   │   ├── layer4-intent.ts      # Intent detection
│   │   ├── layer5-booking.ts     # Booking logic
│   │   ├── layer6-safety.ts      # Safety & quality
│   │   └── layer7-failure.ts     # Failure prevention
│   └── ai-chat/                  # AI chat utilities
│       ├── safety.ts
│       ├── context.ts
│       ├── intent.ts
│       └── quality-metrics.ts
```

---

## 📊 Database Schema

### conversation_state table
```sql
- session_id (unique)
- receptionist_id
- active_flow ('SERVICE' | 'PRODUCT' | null)
- active_topic
- flow_step
- topic_confidence
- slots (jsonb)
- last_message_at
```

### conversation_summaries table
```sql
- receptionist_id
- session_id
- user_fingerprint
- summary
- key_facts (jsonb)
- last_updated
```

---

## ✅ Compliance Status

- [x] 7-Layer Architecture implemented
- [x] 3-Level Re-greeting Prevention
- [x] Rolling Summarization Memory
- [x] Topic-Aware State Engine
- [x] Unified Flow Engine (Service + Product)
- [x] Slot Extraction with Corrections
- [x] Long-Term Memory Summarization
- [x] Safety Classifier
- [x] Quality Metrics
- [x] Escalation Detection
- [x] Auto-Booking/Ordering Execution

**Status: ✅ PRODUCTION READY**
