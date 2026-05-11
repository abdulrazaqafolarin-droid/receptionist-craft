# UI Architecture

Generated from full system audit. Source of truth for widget UI component relationships, data flow, and anti-patterns.

---

## Complete Component Registry

### Primary UI Managers (Dual — CONFLICT EXISTS)

#### WidgetUIManager (NEWER, PREFERRED)
- **File:** `src/components/widget/WidgetUIManager.tsx` (268 lines)
- **Signal type:** `IntentSignal { activeComponent: UIComponentType, componentData: Record<string, unknown> }`
- **Components controlled:**
  - `service_selector` → ServiceSelectorPanel
  - `product_selector` → ProductSelectorPanel
  - `datetime_picker` → DateTimePickerPanel
  - `booking_confirm` → BookingConfirmPanel
  - `order_summary` → OrderSummaryPanel
  - `lead_form` → NO COMPONENT RENDERED (orphan)
- **Dismissal:** Local `dismissedComponents` Set, resets on each component change
- **Panel state:** Local `panelOpen` useState, signals parent via `onPanelStateChange`

#### UISignalRenderer (OLDER, DEPRECATE)
- **File:** `src/components/widget/UISignalRenderer.tsx` (186 lines)
- **Signal type:** `UISignal { version, intent, activeComponent, componentData, dismissPrevious, reason, flow, conversationCanContinue }`
- **Components controlled:**
  - `service_selector` → ServiceSelector
  - `product_selector` → ProductSelectorEnhanced
  - `date_picker` → DateSelector (note: different name from WidgetUIManager's "datetime_picker")
  - `time_picker` → TimeSlotSelector (separate component)
  - `booking_confirmation` → BookingConfirmation (note: different name)
  - `order_summary` → OrderConfirmation
  - `lead_form` → NO COMPONENT RENDERED (orphan)
  - `switch_confirmation` → NO COMPONENT RENDERED (orphan)
- **Dismissal:** `processingDismiss` ref guard, `handleDismiss()` callback
- **Panel state:** `isPanelOpen` useState

### Service Selectors

#### ServiceSelectorPanel (WidgetUIManager path)
- **File:** `src/components/widget/panels/ServiceSelectorPanel.tsx`
- **Props:** services, accentColor, currency, onSelect, onBack
- **Trigger:** activeComponent === "service_selector"
- **Output:** `onSelect(serviceId, serviceName)`
- **State:** Controlled panel (onBack closes)

#### ServiceSelector (UISignalRenderer path)
- **File:** `src/components/widget/ServiceSelector.tsx` (99 lines)
- **Props:** services, onSelect, disabled, initialLimit
- **Trigger:** activeComponent === "service_selector"
- **Output:** `onSelect(serviceId, serviceName)`
- **State:** Local `showAll` toggle for >10 services

### Product Selectors

#### ProductSelectorPanel (WidgetUIManager path)
- **File:** `src/components/widget/panels/ProductSelectorPanel.tsx`
- **Props:** products, accentColor, currency, onConfirm, onBack
- **Trigger:** activeComponent === "product_selector"
- **Output:** `onConfirm(selectedProducts[])`

#### ProductSelectorEnhanced (UISignalRenderer path)
- **File:** `src/components/widget/ProductSelectorEnhanced.tsx` (273 lines)
- **Props:** products, onConfirm, disabled, initialLimit
- **Trigger:** activeComponent === "product_selector"
- **Features:** Stock status, quantity controls, checkbox selection, show more/less
- **Output:** `onConfirm(selectedProducts[])`

### DateTime Selectors

#### DateTimePickerPanel (WidgetUIManager path)
- **File:** `src/components/widget/panels/DateTimePickerPanel.tsx`
- **Props:** accentColor, availableSlots, onConfirm, onBack
- **Trigger:** activeComponent === "datetime_picker"
- **Output:** `onConfirm(date, time)`

#### DateSelector (UISignalRenderer path)
- **File:** `src/components/widget/DateSelector.tsx` (in widget directory)
- **Props:** onSelect, disabled, minDate
- **Trigger:** activeComponent === "date_picker"
- **Output:** `onSelect(date: Date)`

#### TimeSlotSelector (UISignalRenderer path)
- **File:** `src/components/widget/TimeSlotSelector.tsx` (98 lines)
- **Props:** slots, onSelect, disabled, showMore, onShowMore
- **Trigger:** activeComponent === "time_picker"
- **Output:** `onSelect(slot: { startTime, endTime })`
- **Empty state:** Renders "No available slots" with amber warning icon

### Confirmation Panels

#### BookingConfirmPanel (WidgetUIManager path)
- **File:** `src/components/widget/panels/BookingConfirmPanel.tsx`
- **Props:** serviceName, date, time, duration, customerName, customerPhone, customerEmail, price, accentColor, currency, onConfirm, onBack
- **Trigger:** activeComponent === "booking_confirm"
- **Output:** `onConfirm("booking", {})`

#### BookingConfirmation (UISignalRenderer path)
- **File:** `src/components/widget/BookingConfirmation.tsx`
- **Props:** destructured from componentData as Record<string, unknown>
- **Trigger:** activeComponent === "booking_confirmation"
- **Output:** None (informational only — no confirm button visible)

#### OrderSummaryPanel (WidgetUIManager path)
- **File:** `src/components/widget/panels/OrderSummaryPanel.tsx`
- **Props:** products[], customerName, contactInfo, deliveryAddress, totalAmount, accentColor, currency, onConfirm, onBack
- **Trigger:** activeComponent === "order_summary"
- **Output:** `onConfirm("order", {})`

#### OrderConfirmation (UISignalRenderer path)
- **File:** `src/components/widget/OrderConfirmation.tsx`
- **Props:** destructured from componentData
- **Trigger:** activeComponent === "order_summary"
- **Output:** None (informational only)

### Voice Components

#### VoiceInputButton
- **File:** `src/components/widget/VoiceInputButton.tsx` (142 lines)
- **Trigger:** User click
- **States:** idle → recording → processing → idle
- **Dependencies:** navigator.mediaDevices, supabase voice-to-text edge function
- **Output:** `onTranscript(text)`
- **Error handling:** Shows error text for 3 seconds, then auto-clears

#### VoiceChatOverlay
- **File:** `src/components/widget/VoiceChatOverlay.tsx` (373 lines)
- **Trigger:** `open` prop = true
- **States:** idle → listening → processing → speaking → idle
- **Auto-listen:** Starts listening 300ms after opening, re-listens after each response
- **Dependencies:** navigator.mediaDevices, supabase voice-to-text, TTS edge function
- **Output:** `onSendMessage(text)` → AI responds → TTS speaks response
- **Rendering:** Full-screen overlay (z-[9999]) with animated orb

### QuickReplyButtons
- **File:** `src/components/widget/QuickReplyButtons.tsx` (41 lines)
- **Trigger:** `buttons` prop non-empty array
- **Props:** buttons [{label, value}], onSelect, disabled
- **Output:** `onSelect(value)`
- **Style:** Wrap container, pill buttons, staggered animation

---

## Full Trigger Graph

### Path 1: AI sends `intentSignal` (newer, WidgetUIManager)

```
AI response JSON
  → widget-chat/index.ts formats response
  → response.intentSignal is created at function level
  → Widget.tsx receives response and passes intentSignal to WidgetUIManager
  → WidgetUIManager checks intentSignal.activeComponent !== null
  → Shows SuggestionButton with intent mapping
  → User taps → ExpandablePanel opens → PanelContent renders
  → User interacts → onSlotFilled / onConfirm fires
  → Parent receives data, may trigger another message
```

### Path 2: AI sends `signal` (older, UISignalRenderer)

```
AI response JSON
  → widget-chat/index.ts formats response
  → response.signal is created from UISignal type
  → Widget.tsx receives response and passes signal to UISignalRenderer
  → UISignalRenderer checks signal.activeComponent !== null
  → Shows launcher button with label from launcherLabel map
  → User taps → Card panel opens → renderActiveComponent()
  → User interacts → onServiceSelect / onProductsConfirm / etc. fires
  → Parent receives data, may trigger another message
```

### Path 3: Dual activation (CONFLICT PATH)

```
Single AI response contains BOTH:
  intentSignal.activeComponent = "booking_confirm"
  signal.activeComponent       = "booking_confirmation"

Result: TWO booking confirmation UIs render simultaneously.
WidgetUIManager shows BookingConfirmPanel.
UISignalRenderer shows BookingConfirmation card.
```

### Path 4: No signal (FALLBACK)

```
AI response has no intentSignal or signal field
  → WidgetUIManager renders nothing
  → UISignalRenderer renders nothing
  → Only AI text is shown
  → No interactive UI components appear
```

### Orphan Paths

```
AI sends activeComponent = "lead_form"
  → WidgetUIManager: "lead_form" exists in COMPONENT_TO_INTENT map → suggests button
  → User taps → renderPanelContent() returns null for "lead_form"
  → User sees nothing, confused

AI sends activeComponent = "switch_confirmation"
  → UISignalRenderer: has label "Review Prompt" in launcherLabel
  → User taps → renderActiveComponent() returns null for "switch_confirmation"
  → User sees nothing, confused
```

### Component Data Flow

```
WidgetUIManager path:
  intentSignal.componentData.serviceName → BookingConfirmPanel as serviceName ✓
  intentSignal.componentData.date → BookingConfirmPanel as date ✓
  intentSignal.componentData.time → BookingConfirmPanel as time ✓
  intentSignal.componentData.customerName → BookingConfirmPanel as customerName ✓

UISignalRenderer path:
  signal.componentData → cast as Record<string, unknown>
  BookingConfirmation receives {...(data as Record<string, unknown>)}
  No type safety — props are passed by spread with no validation
  If componentData.service_name (snake_case) is passed instead of serviceName (camelCase), it silently fails
```

---

## State Ownership Map

| State | Owner | Persisted | Scope |
|-------|-------|-----------|-------|
| `intentSignal.activeComponent` | widget-chat response → Widget.tsx | No (per message) | Session |
| `signal.activeComponent` | widget-chat response → Widget.tsx | No (per message) | Session |
| `dismissedComponents` Set | WidgetUIManager (local useState) | No | Component instance |
| `panelOpen` | WidgetUIManager (local useState) | No | Component instance |
| `visible` | UISignalRenderer (local useState) | No | Component instance |
| `isPanelOpen` | UISignalRenderer (local useState) | No | Component instance |
| `processingDismiss` ref | UISignalRenderer (useRef) | No | Component instance |
| Slot data (serviceId, date, time, etc.) | Widget.tsx (parent) | Via message history | Session |
| EngineState | conversation_state DB table | Yes (JSON) | Session |
| ActiveTask | conversation_state DB table (slots field) | Yes (JSON) | Session |
| MachineContext | conversation_state DB table (slots field) | Yes (JSON) | Session |
| GovernorState | conversation_state DB table (slots field) | Yes (JSON) | Session |
| ConversationContext | Computed from history per message | No | Per render |
| ConversationState | conversation_state DB table | Yes | Session |

**Key problem:** 5 different state representations are independently written to and read from the same DB field (`slots`), each using different keys (`engineState`, `activeTask`, `machineContext`, `governorState`, `conversationContext`). They are never cross-validated on read.

---

## Component Co-Activation Conflicts

| Component A | Component B | Conflict | Priority Rule |
|------------|------------|----------|---------------|
| WidgetUIManager panel | UISignalRenderer panel | Both render simultaneously | Not resolved — both fire |
| booking_confirm panel | booking_confirmation card | Both show booking details | Not resolved — both fire |
| product_selector panel | product_selector card | Both show product selection | Not resolved — both fire |
| datetime_picker panel | date_picker + time_picker separately | Different formats, same data | Not resolved — both fire |
| SuggestionButton (WidgetUIManager) | LauncherButton (UISignalRenderer) | Two buttons for same thing | Not resolved — both fire |

---

## Never Do This

1. **Never have two UI managers** with overlapping trigger conditions. Choose one (WidgetUIManager has better architecture).

2. **Never use `Record<string, unknown>` for component data.** Every component should receive typed props with explicit validation. Spread of unknown-typed objects causes silent failures.

3. **Never have orphan component types** in the activeComponent union. If `lead_form` maps to no component, remove it from the type or implement the missing component.

4. **Never render two UI components** from a single AI response. A single response should produce at most one interactive component. Use a priority list if multiple are triggered.

5. **Never store multiple state representations** in the same DB field without cross-validation. Each save corrupts the others.

6. **Never dismiss without clean state reset.** When a UI component is dismissed, all collected slot data should be validated (not discarded, not trusted blindly on re-open).

7. **Never hardcode customer field collection order.** The Conversational Collection Engine must iterate `customer_fields` JSONB in the configured order, not assume name→email→phone.

---

*Generated from full system audit — see ai-brain/ROADMAP.md for complete defect matrix*
