# 🧠 CONVERSATION FLOW ARCHITECTURE — COMPLETE DOCUMENTATION

## Overview

This document provides a complete audit of everything that affects the AI receptionist's conversation flow, identifies contradictions with the proposed capability-based architecture, and outlines the implementation plan.

---

## 📁 CURRENT SYSTEM COMPONENTS

### 1. 7-Layer Modular Architecture

| Layer | File | Purpose |
|-------|------|---------|
| 1 | `layer1-identity.ts` | Core AI persona (name, business, tone) |
| 2 | `layer2-knowledge.ts` | RAG knowledge base, FAQs, services |
| 3 | `layer3-memory.ts` | Context extraction, rolling summaries |
| 4 | `layer4-intent.ts` | Intent detection, dialog acts |
| 5 | `layer5-booking.ts` | Booking state machine |
| 6 | `layer6-safety.ts` | Safety classifier, quality metrics |
| 7 | `layer7-failure.ts` | Escalation, uncertainty detection |

### 2. Unified Flow Engine

| File | Purpose |
|------|---------|
| `flow/types.ts` | FlowType, FlowStep, ConversationState |
| `flow/stateManager.ts` | Database persistence of state |
| `flow/flowRouter.ts` | Intent → Flow routing |
| `flow/slotExtractor.ts` | Date/time/contact extraction |
| `flow/memorySummarizer.ts` | Long-term memory |

### 3. Main Orchestrator

- `widget-chat/index.ts` — The brain that combines all layers

---

## 🔍 CURRENT FLOW LOGIC

### FlowType (Binary)
```typescript
type FlowType = 'SERVICE' | 'PRODUCT' | null;
```

### FlowStep (Sequential)
```typescript
type FlowStep = 
  | 'select_service' | 'select_date' | 'select_time'
  | 'select_product' | 'select_quantity'
  | 'collect_name' | 'collect_contact' | 'confirm' | 'complete'
  | null;
```

### AI Mode (Static)
```typescript
ai_mode: 'support' | 'booking' | 'sales'
```

### Intent Types (17 intents)
```typescript
type IntentType = 
  | 'book_appointment' | 'cancel_appointment' | 'reschedule'
  | 'order_product' | 'ask_info' | 'ask_price' | 'ask_hours'
  | 'ask_location' | 'complaint' | 'compliment' | 'small_talk'
  | 'confirm' | 'deny' | 'correct_previous_info'
  | 'follow_up' | 'acknowledgment' | 'greeting' | 'farewell'
  | 'escalation_request' | 'conversation_end' | 'general_query';
```

---

## ⚠️ IDENTIFIED CONTRADICTIONS & INCONSISTENCIES

### CONTRADICTION 1: Static ai_mode vs Dynamic Behavior
**Current**: `ai_mode` is set once at receptionist creation (support/booking/sales)
**Problem**: Doesn't adapt to user intent mid-conversation
**Proposed**: Behavior should switch dynamically based on detected intent + capabilities

### CONTRADICTION 2: Binary FlowType vs Multi-Capability Businesses
**Current**: Either SERVICE or PRODUCT flow, mutually exclusive
**Problem**: Hybrid businesses (pharmacy + consultation) suffer
**Proposed**: Capability graph allows multiple simultaneous capabilities

### CONTRADICTION 3: Business Type is Cosmetic
**Current**: `business_type` is stored but only used for labeling
**Problem**: "Dental Clinic" vs "Grocery Store" run nearly identical flows
**Proposed**: Business capabilities should drive flow selection

### CONTRADICTION 4: Intent Detection Ignores Capabilities
**Current**: Intent detection runs independently of what business can do
**Problem**: AI may try to book appointments for a grocery store
**Proposed**: Intent classification should be filtered by capabilities

### CONTRADICTION 5: Availability is Appointment-Biased
**Current**: `availability_rules` table assumes time-based booking
**Problem**: Retail/product businesses don't need appointment slots
**Proposed**: Context-aware availability (orders, bookings, support)

### CONTRADICTION 6: Services vs Products in Same Table
**Current**: Both stored in `services` table with `is_product` flag
**Problem**: Works but lacks semantic clarity
**Proposed**: Keep for simplicity, but add capability layer on top

### CONTRADICTION 7: Static FAQs vs Contextual Answers
**Current**: FAQs are retrieved and presented statically
**Problem**: Same FAQ answer regardless of conversation context
**Proposed**: AI should rephrase answers based on intent and tone

### CONTRADICTION 8: No Primary Business Goal Optimization
**Current**: `ai_mode` changes prompt, but not behavioral priorities
**Problem**: All modes follow similar patterns
**Proposed**: Primary goal should bias every AI decision

---

## 🎯 PROPOSED CAPABILITY-BASED ARCHITECTURE

### Business Capability Graph

```typescript
interface BusinessCapabilities {
  // Core capabilities
  sells_products: boolean;
  books_appointments: boolean;
  offers_services_on_demand: boolean;
  
  // Modifiers
  delivers: boolean;
  requires_compliance: boolean;
  supports_urgent_requests: boolean;
  has_membership: boolean;
  
  // Primary goal
  primary_goal: 'increase_sales' | 'increase_bookings' | 'reduce_calls' | 'capture_leads';
}
```

### Intent Detection Engine (Pre-Classification)

```typescript
type UniversalIntent = 
  | 'ProductPurchase'     // "I want to buy..."
  | 'AppointmentBooking'  // "I want to book..."
  | 'ServiceRequest'      // "I want a service..."
  | 'Information'         // "What are your hours..."
  | 'Support';            // "I have a problem..."
```

### Dynamic Flow Router

```
User Message
    ↓
Detect Universal Intent
    ↓
Check Business Capabilities
    ↓
IF intent matches capability → Route to flow
IF intent doesn't match → Explain limitation + suggest alternative
    ↓
Execute appropriate flow
```

---

## 🔧 IMPLEMENTATION PLAN

### Phase 1: Database Schema Updates

1. Add `capabilities` JSONB column to `receptionists` table
2. Add `primary_goal` column to `receptionists` table
3. Migrate existing `ai_mode` to new capability structure

### Phase 2: Capability Detection

1. Auto-detect capabilities from services/products during onboarding
2. Allow manual override in receptionist settings
3. Infer capabilities from business_type as fallback

### Phase 3: Intent Classification Update

1. Add universal intent layer BEFORE detailed intent detection
2. Filter detailed intents by business capabilities
3. Add capability validation before flow routing

### Phase 4: Dynamic Flow Router Update

1. Modify `flowRouter.ts` to check capabilities
2. Add capability-based flow selection logic
3. Add fallback/alternative suggestion logic

### Phase 5: Prompt System Update

1. Inject capabilities into system prompt
2. Add capability-aware behavioral rules
3. Update Money Mode to use capabilities

### Phase 6: Onboarding Update

1. Add capability selector to onboarding
2. Keep business_type for UX/presets
3. Add primary_goal selector

---

## 📊 CAPABILITY MAPPING (EXAMPLES)

| Business Type | sells_products | books_appointments | offers_services | delivers | primary_goal |
|---------------|----------------|-------------------|-----------------|----------|--------------|
| Dental Clinic | ✓ (optional) | ✓ | ✗ | ✗ | increase_bookings |
| Grocery Store | ✓ | ✗ | ✗ | ✓ | increase_sales |
| Restaurant | ✗ | ✓ | ✓ | ✓ | increase_bookings |
| Car Wash | ✗ | ✓ (optional) | ✓ | ✗ | increase_sales |
| Pharmacy | ✓ | ✓ | ✓ | ✓ | reduce_calls |
| Law Office | ✗ | ✓ | ✗ | ✗ | capture_leads |
| Gym | ✓ | ✓ | ✓ | ✗ | increase_sales |

---

## 🛡️ INVARIANTS (UNCHANGED)

These rules remain constant regardless of capability:

1. **Greeting = ONCE per session**
2. **Confirmation = ONCE per transaction**
3. **No hallucination of services/prices**
4. **One clarification at a time**
5. **Safety overrides everything**
6. **Human escalation halts AI**

---

## 📈 EXPECTED IMPROVEMENTS

| Metric | Before | After |
|--------|--------|-------|
| Flow accuracy | 7/10 | 9.5/10 |
| Business fit | 6/10 | 9.9/10 |
| Conversion rate | Variable | Optimized by goal |
| User frustration | Medium | Low |
| Scalability | Template-bound | Universal |

---

## 🚀 NEXT STEPS

1. ✅ Document current system (this file)
2. ⏳ Create capability type definitions
3. ⏳ Update database schema
4. ⏳ Update intent classification
5. ⏳ Update flow router
6. ⏳ Update system prompt builder
7. ⏳ Update onboarding flow
8. ⏳ Test with hybrid businesses
