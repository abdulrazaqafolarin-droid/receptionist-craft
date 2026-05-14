# UI Architecture

Source of truth for widget UI component relationships, data flow, and architecture decisions.

---

## Complete Component Registry

### Primary UI Manager

#### UISignalRenderer (SOLE system — consolidated 2026-05-12)
- **File:** `src/components/widget/UISignalRenderer.tsx`
- **Signal type:** `UISignal { version, intent, activeComponent, componentData, dismissPrevious, reason, flow, conversationCanContinue, moneyModeActive }`
- **All 8 component types implemented, no orphans:**
  - `service_selector` → ServiceSelector
  - `product_selector` → ProductSelectorEnhanced
  - `date_picker` → DateSelector
  - `time_picker` → TimeSlotSelector
  - `booking_confirmation` → BookingConfirmation
  - `order_summary` → OrderConfirmation
  - `lead_form` → LeadForm
  - `switch_confirmation` → SwitchConfirmation
- **Dismissal:** `handleDismiss()` callback, `processingDismiss` ref guard against race conditions
- **Panel state:** `isPanelOpen` plus `visible` useState

### Service Selector
- **File:** `src/components/widget/ServiceSelector.tsx`
- **Props:** services, onSelect, disabled, initialLimit
- **Trigger:** activeComponent === "service_selector"
- **Output:** `onSelect(serviceId, serviceName)`
- **State:** Local `showAll` toggle for >10 services

### Product Selector
- **File:** `src/components/widget/ProductSelectorEnhanced.tsx`
- **Props:** products, onConfirm, disabled, initialLimit
- **Trigger:** activeComponent === "product_selector"
- **Features:** Stock status badges, quantity +/- controls, checkbox selection, show more/less
- **Output:** `onConfirm(selectedProducts[])`
- **Note:** Legacy `ProductSelector.tsx` (simple single-select) was removed — superseded by Enhanced

### Date Selector
- **File:** `src/components/widget/DateSelector.tsx`
- **Props:** onSelect, disabled, minDate
- **Trigger:** activeComponent === "date_picker"
- **Output:** `onSelect(date: Date)`

### Time Slot Selector
- **File:** `src/components/widget/TimeSlotSelector.tsx`
- **Props:** slots, onSelect, disabled, showMore, onShowMore
- **Trigger:** activeComponent === "time_picker"
- **Output:** `onSelect(slot: { startTime, endTime })`
- **Empty state:** Renders "No available slots" with amber warning icon

### Booking Confirmation
- **File:** `src/components/widget/BookingConfirmation.tsx`
- **Props:** serviceName, dateTime, date, time, customerName, customerPhone, customerEmail, contactInfo, confirmationId, location, duration, onEdit, onCancel
- **Trigger:** activeComponent === "booking_confirmation"
- **Output:** Green confirmation card with ICS calendar download link

### Order Confirmation
- **File:** `src/components/widget/OrderConfirmation.tsx`
- **Props:** productName, quantity, products, customerName, contactInfo, orderId, totalAmount, deliveryAddress, currency, onEdit, onCancel
- **Trigger:** activeComponent === "order_summary"
- **Output:** Green confirmation card with product line items and total

### Lead Form
- **File:** `src/components/widget/LeadForm.tsx`
- **Props:** onSubmit, onSkip, disabled, componentData
- **Trigger:** activeComponent === "lead_form"
- **Features:** Dynamic field visibility from `customer_fields` JSONB config, inline validation

### Switch Confirmation
- **File:** `src/components/widget/SwitchConfirmation.tsx`
- **Props:** onConfirm, onCancel, disabled, componentData
- **Trigger:** activeComponent === "switch_confirmation"
- **Output:** Amber warning card for flow-switch with reason display

### Voice Input Button
- **File:** `src/components/widget/VoiceInputButton.tsx`
- **Trigger:** User click
- **States:** idle → recording → processing → idle
- **Dependencies:** navigator.mediaDevices, supabase voice-to-text edge function
- **Output:** `onTranscript(text)`
- **Error handling:** Shows error text for 3 seconds, then auto-clears

### Voice Chat Overlay
- **File:** `src/components/widget/VoiceChatOverlay.tsx`
- **Trigger:** `open` prop = true
- **States:** idle → listening → processing → speaking → idle
- **Auto-listen:** Starts 300ms after opening, re-listens after each AI response
- **Dependencies:** navigator.mediaDevices, supabase voice-to-text, TTS edge function
- **Output:** `onSendMessage(text)` → AI responds → TTS speaks response
- **Rendering:** Full-screen overlay (z-[9999]) with animated orb

### Quick Reply Buttons
- **File:** `src/components/widget/QuickReplyButtons.tsx`
- **Trigger:** `buttons` prop non-empty array
- **Props:** buttons [{label, value}], onSelect, disabled
- **Output:** `onSelect(value)`
- **Style:** Wrap container, pill buttons, staggered animation

---

## Trigger Path (Single — no conflicts)

```
AI response JSON
  → widget-chat/index.ts formats response with UISignal
  → Widget.tsx receives response and passes signal to UISignalRenderer
  → UISignalRenderer checks signal.activeComponent !== null
  → Shows launcher button with label from launcherLabel map
  → User taps → Card panel opens → renderActiveComponent()
  → User interacts → onServiceSelect / onProductsConfirm / etc. fires
  → Parent receives data, may trigger another message
```

**Guard:** At most ONE UI component per AI response. If multiple triggered, priority: `booking_confirmation` > `order_summary` > `product_selector` > `service_selector` > `date_picker` > `time_picker` > `lead_form` > `switch_confirmation`.

---

## State Ownership Map

| State | Owner | Persisted | Scope |
|-------|-------|-----------|-------|
| `signal.activeComponent` | widget-chat response → Widget.tsx | No (per message) | Session |
| `visible` | UISignalRenderer (local useState) | No | Component instance |
| `isPanelOpen` | UISignalRenderer (local useState) | No | Component instance |
| `processingDismiss` ref | UISignalRenderer (useRef) | No | Component instance |
| Slot data (serviceId, date, time, etc.) | Widget.tsx (parent) | Via message history | Session |
| EngineState | conversation_state DB table | Yes (JSON) | Session |
| ActiveTask | conversation_state DB table (slots field) | Yes (JSON) | Session |
| ConversationContext | Computed from history per message | No | Per render |

**Architecture decision:** Single state system. EngineState is the canonical source. Slots are derived from conversation_state.

---

## Never Do This

1. **Never have two competing UI signal paths** — single UISignalRenderer is the only path. If adding a new one, remove the old.

2. **Never use `Record<string, unknown>` for component data** — every component receives typed props with explicit validation.

3. **Never have orphan component types** — every member of the `UIComponent` union must have a rendered implementation.

4. **Never render two UI components** from a single AI response — one response = one interactive component max.

5. **Never store multiple state representations** in the same DB field without cross-validation.

6. **Never dismiss without clean state reset** — validate collected slot data on re-open, don't blindly trust it.

7. **Never hardcode customer field collection order** — iterate `customer_fields` JSONB in configured order.

---

*Last updated: 2026-05-13 — Consolidated to single UISignalRenderer system*
