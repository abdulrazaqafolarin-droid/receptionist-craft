# 🏗️ MASTER REBUILD PLAN: AI Business Operator Platform

**Document Version:** 2.0  
**Created:** 2026-02-07  
**Status:** PLANNING PHASE  
**Author:** Lovable AI (Taking Ownership)

---

## 📋 EXECUTIVE SUMMARY

### Current State Assessment

The platform has a **solid conceptual foundation** but suffers from **implementation fragmentation**:

| Area | Status | Issues |
|------|--------|--------|
| **AI Engine** | ⚠️ Fragmented | 5 competing state systems, 4 intent detectors |
| **Conversation Quality** | ⚠️ Robotic | Low temperature, no empathy layer, weak memory use |
| **Booking System** | ✅ Functional | Works but lacks conflict detection, smart alternatives |
| **Product Ordering** | ✅ Basic | Cart works, needs better UX and inventory awareness |
| **Widget UX** | ⚠️ Needs Polish | Functional but not delightful |
| **Omnichannel** | ❌ Missing | Only web widget exists |
| **Analytics** | ✅ Basic | Dashboard exists, needs depth |
| **Multi-Tenant** | ❌ Missing | No agency/enterprise support |

### Target State

A **unified, production-grade platform** that:
1. Works reliably for ANY business type (salon, clinic, restaurant, e-commerce)
2. Handles both **booking** and **product ordering** flows with equal excellence
3. Feels like talking to a **real human receptionist**
4. Scales from small businesses to agencies to enterprises
5. Works across **all channels** (web, WhatsApp, SMS, voice)

---

## 🔍 DETAILED AUDIT

### 1. AI ENGINE AUDIT

#### Files Currently Handling AI Logic

| File | Purpose | Lines | Keep/Merge/Remove |
|------|---------|-------|-------------------|
| `widget-chat/index.ts` | Main endpoint | 2322 | **Refactor** - too large |
| `flow/unifiedCore.ts` | Attempted consolidation | 901 | **Enhance** - make authoritative |
| `flow/conversationGovernor.ts` | State enforcement | 707 | **Merge** into unifiedCore |
| `flow/memoryPipeline.ts` | Memory management | ~500 | **Merge** into unifiedCore |
| `flow/taskIntelligence.ts` | Task tracking | ~400 | **Merge** into unifiedCore |
| `flow/stateManager.ts` | State persistence | ~300 | **Keep** - DB layer |
| `flow/flowRouter.ts` | Step routing | ~250 | **Merge** into unifiedCore |
| `flow/slotExtractor.ts` | Entity extraction | ~200 | **Merge** into unifiedCore |
| `stateMachine.ts` | FSM implementation | ~400 | **Remove** - redundant |
| `hallucinationGuard.ts` | Grounding checks | ~200 | **Keep** - critical safety |
| `actionGate.ts` | Permission validation | ~150 | **Keep** - critical safety |

#### Problems Identified

1. **Intent Detection Duplication**
   - `widget-chat/index.ts` lines 232-269: `detectIntent()`
   - `flow/unifiedCore.ts` lines 146-237: `detectUnifiedIntent()`
   - `flow/conversationGovernor.ts` lines 143-209: `clarifyIntent()`
   - `flow/memoryPipeline.ts`: `detectIntent()`
   - `_shared/capabilities/intentClassifier.ts`: `classifyUniversalIntent()`

2. **State Object Fragmentation**
   - `ConversationState` (flow/types.ts)
   - `ActiveTask` (flow/types.ts)
   - `GovernorState` (flow/conversationGovernor.ts)
   - `UnifiedState` (flow/unifiedCore.ts)
   - `MachineContext` (stateMachine.ts)

3. **Governor Not Enforced**
   - `buildGovernorPrompt()` exists but isn't injected as a STRICT constraint
   - AI can still improvise because prompt is advisory, not blocking

#### Solution: Unified Engine v2

```
SINGLE PIPELINE:
┌──────────────────────────────────────────────────────────────────┐
│                     widget-chat/index.ts                         │
│                     (THIN ORCHESTRATOR)                          │
├──────────────────────────────────────────────────────────────────┤
│  1. Parse Request                                                │
│  2. Validate Input (abuse check)                                 │
│  3. Load State (from DB via stateManager)                        │
│  4. RUN UNIFIED ENGINE ─────────────────────────────────────────│
│     │                                                            │
│     ├── Step 1: Clean Input (typos, normalization)              │
│     ├── Step 2: Detect Intent (SINGLE function)                 │
│     ├── Step 3: Extract Entities (SINGLE function)              │
│     ├── Step 4: Update State (SINGLE ActiveTask)                │
│     ├── Step 5: Check Requirements (missing fields)             │
│     ├── Step 6: Generate Governor Instruction                   │
│     └── Step 7: Build Prompt (with STRICT constraints)          │
│                                                                  │
│  5. Call LLM (with governor-injected prompt)                    │
│  6. Validate Response (hallucination guard)                     │
│  7. Execute Actions (book/order if confirmed)                   │
│  8. Save State (to DB)                                          │
│  9. Return Response                                              │
└──────────────────────────────────────────────────────────────────┘
```

---

### 2. CONVERSATION QUALITY AUDIT

#### Current Problems

| Issue | Evidence | Impact |
|-------|----------|--------|
| **Robotic Responses** | "I'll need your name for the booking" (every time, same phrasing) | Users feel they're talking to a bot |
| **No Sentiment Detection** | Frustrated user gets same tone as happy user | Poor experience |
| **Low Temperature** | 0.7 (too deterministic) | Repetitive phrasing |
| **Memory Not Used** | AI doesn't reference earlier conversation | Feels disconnected |
| **No Variety** | Same questions phrased identically | Predictable |

#### Solution: Personality Engine

```
RESPONSE GENERATION PIPELINE:
┌──────────────────────────────────────────────────────────────────┐
│                    PRE-RESPONSE ANALYSIS                         │
├──────────────────────────────────────────────────────────────────┤
│  1. Sentiment Detection                                          │
│     - Happy: "Great!", "Thanks!", "Awesome"                     │
│     - Frustrated: "Why", "Again?", "Already told you"           │
│     - Confused: "What?", "I don't understand"                   │
│     - Urgent: "ASAP", "Emergency", "Right now"                  │
│                                                                  │
│  2. Context Injection                                            │
│     - "Since you mentioned [X] earlier..."                      │
│     - "For your [service] appointment on [date]..."             │
│                                                                  │
│  3. Tone Adaptation                                              │
│     - Frustrated user: More empathetic, apologetic              │
│     - Happy user: Match enthusiasm                              │
│     - Confused user: Simpler language, step-by-step             │
│                                                                  │
│  4. Phrasing Variety                                             │
│     - "What name should I use?" / "May I have your name?"       │
│     - "What day works?" / "When were you thinking?"             │
└──────────────────────────────────────────────────────────────────┘
```

**Temperature Adjustment:**
- Current: 0.7 (too rigid)
- Target: 0.85-0.9 (more natural)
- Exception: 0.7 for data extraction (dates, times, prices)

---

### 3. BOOKING SYSTEM AUDIT

#### Current Flow

```
CURRENT:
1. User: "I want to book"
2. AI: Shows service selector
3. User: Selects service
4. AI: Shows date picker
5. User: Selects date
6. AI: Shows time slots
7. User: Selects time
8. AI: Asks for name
9. User: Provides name
10. AI: Asks for contact
11. User: Provides contact
12. AI: Shows confirmation
13. User: Confirms
14. API: book-appointment called
15. AI: "You're all set!"
```

#### Problems Identified

| Issue | Description | Risk |
|-------|-------------|------|
| **No Conflict Detection** | Can book same slot twice | Double-booking |
| **No Buffer Time** | No gap between appointments | Back-to-back chaos |
| **No Idempotency** | Retry can create duplicate | Duplicate bookings |
| **Weak Alternatives** | Limited fallback options | User abandonment |
| **No Confirmation Email** | User gets no record | Forgotten appointments |

#### Solution: Robust Booking Engine

```
ENHANCED BOOKING FLOW:
┌──────────────────────────────────────────────────────────────────┐
│                     BOOKING ENGINE v2                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STEP 1: Service Selection                                       │
│  - Show available services                                       │
│  - Include duration and price                                   │
│  - Handle "I'm not sure" → suggest based on context             │
│                                                                  │
│  STEP 2: Date Selection                                          │
│  - Show calendar with available days only                       │
│  - Respect business hours and exceptions                        │
│  - Handle "next week" / "this Friday" parsing                   │
│                                                                  │
│  STEP 3: Time Selection                                          │
│  - Show slots respecting:                                        │
│    - Service duration                                           │
│    - Buffer before/after                                        │
│    - Existing appointments                                      │
│    - Business hours                                             │
│  - If requested time unavailable:                               │
│    - Show closest alternatives                                  │
│    - Explain why (already booked, outside hours)                │
│                                                                  │
│  STEP 4: Contact Collection                                      │
│  - Name (required)                                               │
│  - Phone OR Email (at least one required)                       │
│  - Validate format before proceeding                            │
│                                                                  │
│  STEP 5: Confirmation                                            │
│  - ONE summary (never repeat)                                   │
│  - Clear ask: "Should I book this?"                             │
│                                                                  │
│  STEP 6: Execution                                               │
│  - Generate idempotency key                                     │
│  - Check for conflicts (final check)                            │
│  - Create appointment                                           │
│  - Generate confirmation/cancellation tokens                    │
│  - Send confirmation email                                      │
│  - Show success with appointment ID                             │
│                                                                  │
│  STEP 7: Follow-Up                                               │
│  - "Is there anything else I can help with?"                    │
│  - If no: graceful close                                        │
│  - If yes: reset for new task                                   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

### 4. PRODUCT ORDERING AUDIT

#### Current Flow

```
CURRENT:
1. User: "I want to order"
2. AI: Shows product selector
3. User: Selects product(s)
4. AI: Asks for quantity
5. User: Provides quantity
6. AI: Asks for name
7. User: Provides name
8. AI: Asks for contact
9. User: Provides contact
10. AI: Asks for delivery address (if applicable)
11. User: Provides address
12. AI: Shows confirmation
13. User: Confirms
14. API: creates order + order_items
15. AI: "Your order is placed!"
```

#### Problems Identified

| Issue | Description | Risk |
|-------|-------------|------|
| **Basic Cart** | Single product focus, weak multi-item UX | Cart abandonment |
| **No Inventory Check** | Can order out-of-stock items | Failed orders |
| **No Price Display** | User doesn't see total until end | Sticker shock |
| **No Order Status** | User can't track order | Poor experience |
| **No Upselling** | Missed revenue opportunity | Lost revenue |

#### Solution: Commerce Engine

```
ENHANCED ORDERING FLOW:
┌──────────────────────────────────────────────────────────────────┐
│                     COMMERCE ENGINE v2                           │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STEP 1: Product Selection                                       │
│  - Show product catalog with:                                   │
│    - Name, description, price                                   │
│    - Stock status (in stock / low stock / out of stock)         │
│    - Images (if available)                                      │
│  - Support multiple product selection                           │
│  - Running total visible                                        │
│                                                                  │
│  STEP 2: Quantity & Cart Management                              │
│  - Per-product quantity adjustment                              │
│  - Remove items from cart                                       │
│  - Cart summary visible                                         │
│                                                                  │
│  STEP 3: Upsell/Cross-sell (if applicable)                      │
│  - "Would you like to add [complementary product]?"             │
│  - "Customers also bought..."                                   │
│                                                                  │
│  STEP 4: Contact Collection                                      │
│  - Name (required)                                               │
│  - Phone OR Email (required)                                    │
│                                                                  │
│  STEP 5: Delivery (if enabled)                                   │
│  - Delivery address (required if delivers:true)                 │
│  - Delivery fee calculation (if applicable)                     │
│                                                                  │
│  STEP 6: Order Summary                                           │
│  - Itemized list with quantities and prices                     │
│  - Subtotal, tax (if applicable), delivery fee                  │
│  - Total                                                        │
│                                                                  │
│  STEP 7: Confirmation                                            │
│  - ONE summary (never repeat)                                   │
│  - "Should I place this order?"                                 │
│                                                                  │
│  STEP 8: Execution                                               │
│  - Validate inventory (final check)                             │
│  - Create order + order_items                                   │
│  - Decrement stock quantities                                   │
│  - Generate order ID                                            │
│  - Send confirmation email                                      │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

### 5. WIDGET UX AUDIT

#### Current State

| Component | Status | Issues |
|-----------|--------|--------|
| **Chat Bubble** | ✅ Works | Could use better animation |
| **Message Thread** | ✅ Works | Typing indicator basic |
| **Service Selector** | ⚠️ Needs Work | Appears on keyword match, not context |
| **Date Picker** | ⚠️ Needs Work | Same issue |
| **Time Slots** | ⚠️ Needs Work | Same issue |
| **Product Selector** | ✅ Good | ProductSelectorEnhanced is solid |
| **Confirmation Cards** | ✅ Works | Could be prettier |
| **Quick Replies** | ❌ Missing | Would improve UX |
| **Voice Input** | ⚠️ Exists | Not well integrated |

#### Solution: Context-Aware Widget

**Key Principle:** UI components appear ONLY when the AI explicitly requests that information (via backend `uiHints`), NOT based on frontend keyword detection.

```
UI HINT SYSTEM:
┌──────────────────────────────────────────────────────────────────┐
│                     BACKEND RESPONSE                             │
├──────────────────────────────────────────────────────────────────┤
│  {                                                               │
│    "reply": "What service would you like to book?",             │
│    "uiHints": {                                                  │
│      "show_services": true,                                     │
│      "show_calendar": false,                                    │
│      "show_time_slots": false,                                  │
│      "show_products": false,                                    │
│      "show_confirmation": false,                                │
│      "quick_replies": ["Haircut", "Coloring", "Styling"]        │
│    }                                                            │
│  }                                                               │
└──────────────────────────────────────────────────────────────────┘

FRONTEND LOGIC:
- if (uiHints.show_services) → render ServiceSelector
- if (uiHints.show_calendar) → render DatePicker
- if (uiHints.show_time_slots) → render TimeSlotSelector
- if (uiHints.show_products) → render ProductSelector
- if (uiHints.quick_replies) → render QuickReplyButtons
```

---

### 6. OMNICHANNEL AUDIT

#### Current State

| Channel | Status | Priority |
|---------|--------|----------|
| **Web Widget** | ✅ Implemented | Maintain |
| **WhatsApp** | ❌ Missing | HIGH |
| **SMS** | ❌ Missing | MEDIUM |
| **Voice** | ❌ Missing | LOW (complex) |

#### Solution: Channel Abstraction Layer

```
CHANNEL ABSTRACTION:
┌──────────────────────────────────────────────────────────────────┐
│                     MESSAGE NORMALIZER                           │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Widget]      [WhatsApp]      [SMS]         [Voice]            │
│      │              │            │              │                │
│      └──────────────┴────────────┴──────────────┘               │
│                          │                                       │
│                 ┌────────▼────────┐                             │
│                 │  NORMALIZE TO:  │                             │
│                 │  {              │                             │
│                 │    channel,     │                             │
│                 │    sender_id,   │                             │
│                 │    message,     │                             │
│                 │    metadata     │                             │
│                 │  }              │                             │
│                 └────────┬────────┘                             │
│                          │                                       │
│              ┌───────────▼───────────┐                          │
│              │    UNIFIED ENGINE     │                          │
│              └───────────┬───────────┘                          │
│                          │                                       │
│                 ┌────────▼────────┐                             │
│                 │  DENORMALIZE TO │                             │
│                 │  Channel Format │                             │
│                 └────────┬────────┘                             │
│                          │                                       │
│      ┌──────────────┬────────────┬──────────────┐               │
│      │              │            │              │                │
│  [Widget]      [WhatsApp]      [SMS]         [Voice]            │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 📊 IMPLEMENTATION PHASES

### Phase 0: Preparation (This Session)
- [x] Complete audit document
- [ ] Define file structure
- [ ] Define database schema changes (if any)
- [ ] Define API contracts

### Phase 1: Unified AI Engine (Week 1-2)
- [ ] Create `engine/core.ts` - single pipeline
- [ ] Consolidate intent detection into ONE function
- [ ] Consolidate entity extraction into ONE function
- [ ] Consolidate state management into ONE ActiveTask
- [ ] Implement strict Governor enforcement
- [ ] Update widget-chat to use new engine
- [ ] Test booking flow end-to-end
- [ ] Test ordering flow end-to-end

### Phase 2: Conversation Quality (Week 2-3)
- [ ] Add sentiment detection
- [ ] Implement tone adaptation
- [ ] Add phrasing variety
- [ ] Increase temperature to 0.85
- [ ] Add context injection ("You mentioned earlier...")
- [ ] Test with sample conversations

### Phase 3: Widget Polish (Week 3-4)
- [ ] Implement uiHints-driven component rendering
- [ ] Add quick replies
- [ ] Improve typing indicator
- [ ] Add message animations
- [ ] Mobile optimization
- [ ] Accessibility improvements

### Phase 4: Booking Robustness (Week 4-5)
- [ ] Implement conflict detection
- [ ] Add buffer time support
- [ ] Implement idempotency keys
- [ ] Smart alternatives when slot unavailable
- [ ] Confirmation email integration
- [ ] Cancellation/reschedule token links

### Phase 5: Commerce Enhancement (Week 5-6)
- [ ] Real-time inventory checking
- [ ] Improved multi-product cart UX
- [ ] Running total display
- [ ] Upsell/cross-sell suggestions
- [ ] Order confirmation emails
- [ ] Order status tracking

### Phase 6: WhatsApp Integration (Week 6-7)
- [ ] Create WhatsApp webhook handler
- [ ] Message normalization layer
- [ ] Response denormalization
- [ ] Session management for WhatsApp
- [ ] Test full flows via WhatsApp

### Phase 7: SMS Integration (Week 7-8)
- [ ] Create SMS webhook handler (Twilio)
- [ ] Inbound message handling
- [ ] Outbound response formatting
- [ ] Test full flows via SMS

### Phase 8: Analytics & Dashboard (Week 8-9)
- [ ] Conversation metrics
- [ ] Booking metrics
- [ ] Order metrics
- [ ] AI quality metrics
- [ ] Revenue attribution
- [ ] Dashboard visualizations

### Phase 9: Multi-Tenant Support (Week 9-10)
- [ ] Agency model database schema
- [ ] White-label configuration
- [ ] Client management UI
- [ ] Enterprise multi-location support

---

## 🗂️ FILE STRUCTURE (TARGET)

```
src/
├── components/
│   ├── widget/
│   │   ├── ChatBubble.tsx              # Floating chat button
│   │   ├── ChatWindow.tsx              # Main chat interface
│   │   ├── MessageThread.tsx           # Message list container
│   │   ├── MessageBubble.tsx           # Individual message
│   │   ├── TypingIndicator.tsx         # "AI is typing..."
│   │   ├── QuickReplies.tsx            # Suggested responses
│   │   ├── InputArea.tsx               # Text input + send button
│   │   └── cards/
│   │       ├── ServiceCard.tsx         # Service selection
│   │       ├── DatePicker.tsx          # Calendar selection
│   │       ├── TimeSlots.tsx           # Time slot selection
│   │       ├── ProductCard.tsx         # Product selection
│   │       ├── CartSummary.tsx         # Order cart
│   │       └── ConfirmationCard.tsx    # Booking/order summary
│   ├── dashboard/
│   │   ├── StatsCards.tsx
│   │   ├── ConversationChart.tsx
│   │   ├── RevenueChart.tsx
│   │   └── RecentActivity.tsx
│   └── shared/
│       ├── LoadingSpinner.tsx
│       ├── ErrorBoundary.tsx
│       └── EmptyState.tsx
├── pages/
│   ├── Landing.tsx                     # Marketing page
│   ├── Auth.tsx                        # Login/signup
│   ├── Dashboard.tsx                   # Main dashboard
│   ├── Builder.tsx                     # Receptionist editor
│   ├── OnboardingWizard.tsx            # Setup wizard
│   ├── Appointments.tsx                # Appointment management
│   ├── Orders.tsx                      # Order management
│   ├── Analytics.tsx                   # Detailed analytics
│   ├── Settings.tsx                    # Account settings
│   └── Widget.tsx                      # Embeddable widget
└── hooks/
    ├── useChat.ts                      # Chat state management
    ├── useReceptionist.ts              # Receptionist data
    ├── useAppointments.ts              # Appointment operations
    ├── useOrders.ts                    # Order operations
    └── useAnalytics.ts                 # Analytics data

supabase/functions/
├── _shared/
│   ├── engine/                         # UNIFIED AI ENGINE
│   │   ├── index.ts                    # Main export
│   │   ├── core.ts                     # Pipeline orchestrator
│   │   ├── intent.ts                   # SINGLE intent detector
│   │   ├── entities.ts                 # SINGLE entity extractor
│   │   ├── state.ts                    # State manager (ActiveTask)
│   │   ├── governor.ts                 # Enforcement layer
│   │   ├── prompt.ts                   # Dynamic prompt builder
│   │   └── types.ts                    # Type definitions
│   ├── booking/
│   │   ├── availability.ts             # Availability calculation
│   │   ├── conflicts.ts                # Conflict detection
│   │   └── emails.ts                   # Email templates
│   ├── commerce/
│   │   ├── inventory.ts                # Stock management
│   │   ├── cart.ts                     # Cart operations
│   │   └── emails.ts                   # Order email templates
│   ├── channels/
│   │   ├── normalizer.ts               # Message normalization
│   │   ├── widget.ts                   # Widget adapter
│   │   ├── whatsapp.ts                 # WhatsApp adapter
│   │   └── sms.ts                      # SMS adapter
│   └── safety/
│       ├── hallucination.ts            # Grounding validation
│       ├── abuse.ts                    # Rate limiting
│       └── validation.ts               # Input validation
├── widget-chat/                        # Widget endpoint
├── whatsapp-webhook/                   # WhatsApp endpoint
├── sms-webhook/                        # SMS endpoint
├── book-appointment/                   # Booking execution
├── create-order/                       # Order execution
├── check-availability/                 # Availability API
└── analytics/                          # Analytics endpoints
```

---

## 📋 DATABASE SCHEMA (TARGET)

### Tables Overview

| Table | Purpose | Status |
|-------|---------|--------|
| `receptionists` | AI configuration | ✅ Exists |
| `services` | Services/Products catalog | ✅ Exists |
| `appointments` | Booked appointments | ✅ Exists |
| `orders` | Product orders | ✅ Exists |
| `order_items` | Order line items | ✅ Exists |
| `conversation_state` | Session state | ✅ Exists |
| `chat_messages` | Message history | ✅ Exists |
| `availability_rules` | Business hours | ✅ Exists |
| `availability_exceptions` | Holidays/closures | ✅ Exists |
| `notifications` | User notifications | ✅ Exists |
| `profiles` | User profiles | ✅ Exists |

### Schema Changes Needed

None required for Phase 1-5. Future phases may need:
- `agencies` table (Phase 9)
- `organization_locations` table (Phase 9)

---

## 🔐 SECURITY CONSIDERATIONS

### Current Security Measures (Keep)
- RLS policies on all tables
- Abuse protection (rate limiting)
- Input sanitization
- Safety classifier for harmful content
- Hallucination guard for data grounding

### Security Improvements Needed
- [ ] Add request signing for webhooks (WhatsApp, SMS)
- [ ] Implement CSRF protection for widget
- [ ] Add audit logging for sensitive operations
- [ ] Implement session token rotation

---

## 📈 SUCCESS METRICS

### Phase 1 Success Criteria
- [ ] Booking flow works 100% end-to-end
- [ ] Ordering flow works 100% end-to-end
- [ ] Zero state fragmentation bugs
- [ ] AI follows Governor rules strictly

### Phase 2 Success Criteria
- [ ] Response variety (no two same questions phrased identically)
- [ ] Sentiment-appropriate responses
- [ ] Context references in responses

### Overall Success Criteria
- [ ] < 5% conversation abandonment rate
- [ ] < 2s average response time
- [ ] > 90% booking completion rate
- [ ] > 85% order completion rate
- [ ] > 4.5/5 user satisfaction score

---

## 🚀 NEXT STEPS

After reviewing this document:

1. **Approve the plan** or request changes
2. **Choose Phase 1 starting point**:
   - Option A: Start with Unified Engine consolidation
   - Option B: Start with Widget UX improvements
   - Option C: Start with Booking robustness
3. **Set priority for flows**:
   - Booking-first, then Ordering
   - Ordering-first, then Booking
   - Both in parallel

---

## 📝 NOTES

This is a living document. As we implement each phase, findings and adjustments will be added here.

---

**Document created by Lovable AI**  
**Ready for implementation upon approval**
