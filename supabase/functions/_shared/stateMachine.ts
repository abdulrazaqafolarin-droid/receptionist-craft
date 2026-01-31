// ═══════════════════════════════════════════════════════════════════════════
// CONVERSATION STATE MACHINE
// ═══════════════════════════════════════════════════════════════════════════
// 
// This module enforces a strict state machine for conversation flows.
// The AI CANNOT jump around - it must follow valid transitions.
// State changes only occur through explicit transitions.
//
// States:
//   idle → selecting_service → selecting_date → selecting_time → 
//   collecting_contact → confirming → completed
//
// For ordering:
//   idle → selecting_product → selecting_quantity → 
//   collecting_contact → confirming → completed
//
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// STATE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────
export type ConversationMachineState =
  | 'idle'                    // General chat, no flow active
  | 'selecting_service'       // Waiting for service selection
  | 'selecting_date'          // Waiting for date selection
  | 'selecting_time'          // Waiting for time selection
  | 'selecting_product'       // Waiting for product selection
  | 'selecting_quantity'      // Waiting for quantity input
  | 'collecting_contact'      // Waiting for name + phone/email
  | 'confirming'              // Waiting for user confirmation
  | 'completed';              // Transaction finished

export type FlowType = 'booking' | 'ordering' | null;

// ─────────────────────────────────────────────────────────────────────────────
// TRANSITION EVENTS
// ─────────────────────────────────────────────────────────────────────────────
export type TransitionEvent =
  // Start flows
  | 'START_BOOKING'
  | 'START_ORDER'
  // Progress events
  | 'SERVICE_SELECTED'
  | 'DATE_SELECTED'
  | 'TIME_SELECTED'
  | 'PRODUCT_SELECTED'
  | 'QUANTITY_SELECTED'
  | 'CONTACT_PROVIDED'
  | 'USER_CONFIRMED'
  | 'USER_CANCELLED'
  // Reset events
  | 'RESET'
  | 'TIMEOUT'
  | 'ABANDON';

// ─────────────────────────────────────────────────────────────────────────────
// STATE MACHINE CONTEXT
// ─────────────────────────────────────────────────────────────────────────────
export interface MachineContext {
  state: ConversationMachineState;
  flow: FlowType;
  previousState: ConversationMachineState | null;
  stateEnteredAt: string;
  transitionHistory: Array<{ from: ConversationMachineState; to: ConversationMachineState; event: TransitionEvent; at: string }>;
  // Collected data
  serviceId: string | null;
  serviceName: string | null;
  date: string | null;
  time: string | null;
  productId: string | null;
  productName: string | null;
  quantity: number | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  // Multi-product support
  selectedProducts: Array<{ productId: string; productName: string; quantity: number; price?: number }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// VALID TRANSITIONS MAP
// ─────────────────────────────────────────────────────────────────────────────
const BOOKING_TRANSITIONS: Record<ConversationMachineState, Partial<Record<TransitionEvent, ConversationMachineState>>> = {
  idle: {
    START_BOOKING: 'selecting_service',
    START_ORDER: 'selecting_product',
  },
  selecting_service: {
    SERVICE_SELECTED: 'selecting_date',
    RESET: 'idle',
    ABANDON: 'idle',
  },
  selecting_date: {
    DATE_SELECTED: 'selecting_time',
    RESET: 'idle',
    ABANDON: 'idle',
  },
  selecting_time: {
    TIME_SELECTED: 'collecting_contact',
    RESET: 'idle',
    ABANDON: 'idle',
  },
  selecting_product: {
    PRODUCT_SELECTED: 'selecting_quantity',
    RESET: 'idle',
    ABANDON: 'idle',
  },
  selecting_quantity: {
    QUANTITY_SELECTED: 'collecting_contact',
    RESET: 'idle',
    ABANDON: 'idle',
  },
  collecting_contact: {
    CONTACT_PROVIDED: 'confirming',
    RESET: 'idle',
    ABANDON: 'idle',
  },
  confirming: {
    USER_CONFIRMED: 'completed',
    USER_CANCELLED: 'idle',
    RESET: 'idle',
  },
  completed: {
    RESET: 'idle',
    START_BOOKING: 'selecting_service',
    START_ORDER: 'selecting_product',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE INITIAL CONTEXT
// ─────────────────────────────────────────────────────────────────────────────
export function createMachineContext(): MachineContext {
  return {
    state: 'idle',
    flow: null,
    previousState: null,
    stateEnteredAt: new Date().toISOString(),
    transitionHistory: [],
    serviceId: null,
    serviceName: null,
    date: null,
    time: null,
    productId: null,
    productName: null,
    quantity: null,
    customerName: null,
    customerPhone: null,
    customerEmail: null,
    selectedProducts: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSITION FUNCTION
// ─────────────────────────────────────────────────────────────────────────────
export interface TransitionResult {
  success: boolean;
  newState: ConversationMachineState;
  error?: string;
  context: MachineContext;
}

export function transition(
  context: MachineContext,
  event: TransitionEvent,
  data?: Partial<MachineContext>
): TransitionResult {
  const currentState = context.state;
  const validTransitions = BOOKING_TRANSITIONS[currentState];
  const newState = validTransitions?.[event];

  if (!newState) {
    // Invalid transition - stay in current state
    console.warn(`[StateMachine] Invalid transition: ${currentState} + ${event}`);
    return {
      success: false,
      newState: currentState,
      error: `Cannot ${event} from state ${currentState}`,
      context,
    };
  }

  // Create new context with transition
  const newContext: MachineContext = {
    ...context,
    ...data,
    state: newState,
    previousState: currentState,
    stateEnteredAt: new Date().toISOString(),
    transitionHistory: [
      ...context.transitionHistory.slice(-10), // Keep last 10 transitions
      { from: currentState, to: newState, event, at: new Date().toISOString() },
    ],
  };

  // Set flow type based on event
  if (event === 'START_BOOKING') {
    newContext.flow = 'booking';
  } else if (event === 'START_ORDER') {
    newContext.flow = 'ordering';
  } else if (event === 'RESET' || event === 'ABANDON') {
    newContext.flow = null;
  }

  console.log(`[StateMachine] Transition: ${currentState} → ${newState} (${event})`);
  
  return {
    success: true,
    newState,
    context: newContext,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE-BASED UI HINTS
// ─────────────────────────────────────────────────────────────────────────────
export interface StateUIHints {
  showServiceSelector: boolean;
  showDatePicker: boolean;
  showTimePicker: boolean;
  showProductSelector: boolean;
  showQuantityInput: boolean;
  showContactForm: boolean;
  showConfirmButton: boolean;
  expectedInput: string;
}

export function getUIHintsForState(state: ConversationMachineState): StateUIHints {
  const hints: StateUIHints = {
    showServiceSelector: false,
    showDatePicker: false,
    showTimePicker: false,
    showProductSelector: false,
    showQuantityInput: false,
    showContactForm: false,
    showConfirmButton: false,
    expectedInput: '',
  };

  switch (state) {
    case 'idle':
      hints.expectedInput = 'general_chat';
      break;
    case 'selecting_service':
      hints.showServiceSelector = true;
      hints.expectedInput = 'service_selection';
      break;
    case 'selecting_date':
      hints.showDatePicker = true;
      hints.expectedInput = 'date_selection';
      break;
    case 'selecting_time':
      hints.showTimePicker = true;
      hints.expectedInput = 'time_selection';
      break;
    case 'selecting_product':
      hints.showProductSelector = true;
      hints.expectedInput = 'product_selection';
      break;
    case 'selecting_quantity':
      hints.showQuantityInput = true;
      hints.expectedInput = 'quantity_input';
      break;
    case 'collecting_contact':
      hints.showContactForm = true;
      hints.expectedInput = 'contact_info';
      break;
    case 'confirming':
      hints.showConfirmButton = true;
      hints.expectedInput = 'confirmation';
      break;
    case 'completed':
      hints.expectedInput = 'followup_or_close';
      break;
  }

  return hints;
}

// ─────────────────────────────────────────────────────────────────────────────
// REDIRECT MESSAGES (GENTLY GUIDE USER BACK TO CURRENT STATE)
// ─────────────────────────────────────────────────────────────────────────────
export function getRedirectMessage(state: ConversationMachineState, flow: FlowType): string {
  const flowName = flow === 'booking' ? 'appointment' : flow === 'ordering' ? 'order' : '';
  
  switch (state) {
    case 'selecting_service':
      return `I'd love to help with that! But first, which service would you like to book?`;
    case 'selecting_date':
      return `Great question! Once we confirm the date for your ${flowName}, I can help with that. What day works best for you?`;
    case 'selecting_time':
      return `I'll be happy to help with that shortly. What time would you prefer for your ${flowName}?`;
    case 'selecting_product':
      return `Sure! Let me know which product you're interested in first, and then I can answer that.`;
    case 'selecting_quantity':
      return `Got it! How many would you like to order?`;
    case 'collecting_contact':
      return `I can help with that in just a moment. First, may I get your name and phone number or email to complete the ${flowName}?`;
    case 'confirming':
      return `Almost there! Can you confirm the details look correct so we can finalize your ${flowName}?`;
    default:
      return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE-SPECIFIC QUESTIONS
// ─────────────────────────────────────────────────────────────────────────────
export function getStateQuestion(state: ConversationMachineState, context: MachineContext): string {
  switch (state) {
    case 'selecting_service':
      return "What service would you like to book?";
    case 'selecting_date':
      return `Great choice${context.serviceName ? ` on ${context.serviceName}` : ''}! What day works best for you?`;
    case 'selecting_time':
      return `Perfect${context.date ? `, ${context.date} it is` : ''}! What time would you prefer?`;
    case 'selecting_product':
      return "Which product would you like to order?";
    case 'selecting_quantity':
      return `Great choice${context.productName ? ` on ${context.productName}` : ''}! How many would you like?`;
    case 'collecting_contact':
      return "May I have your name and phone number or email to complete this?";
    case 'confirming':
      return buildConfirmationSummary(context);
    case 'completed':
      return "Is there anything else I can help you with?";
    default:
      return "";
  }
}

function buildConfirmationSummary(context: MachineContext): string {
  if (context.flow === 'booking') {
    const parts = [];
    if (context.serviceName) parts.push(`**Service:** ${context.serviceName}`);
    if (context.date) parts.push(`**Date:** ${context.date}`);
    if (context.time) parts.push(`**Time:** ${context.time}`);
    if (context.customerName) parts.push(`**Name:** ${context.customerName}`);
    if (context.customerPhone) parts.push(`**Phone:** ${context.customerPhone}`);
    if (context.customerEmail) parts.push(`**Email:** ${context.customerEmail}`);
    
    return `Here's a summary of your appointment:\n\n${parts.join('\n')}\n\nDoes everything look correct?`;
  } else if (context.flow === 'ordering') {
    const parts = [];
    if (context.selectedProducts.length > 0) {
      parts.push('**Products:**');
      context.selectedProducts.forEach(p => {
        parts.push(`  - ${p.productName} × ${p.quantity}${p.price ? ` ($${p.price.toFixed(2)})` : ''}`);
      });
    } else if (context.productName) {
      parts.push(`**Product:** ${context.productName} × ${context.quantity || 1}`);
    }
    if (context.customerName) parts.push(`**Name:** ${context.customerName}`);
    if (context.customerPhone) parts.push(`**Phone:** ${context.customerPhone}`);
    if (context.customerEmail) parts.push(`**Email:** ${context.customerEmail}`);
    
    return `Here's a summary of your order:\n\n${parts.join('\n')}\n\nShall I place this order?`;
  }
  
  return "Does everything look correct?";
}

// ─────────────────────────────────────────────────────────────────────────────
// DETECT EVENT FROM USER INPUT
// ─────────────────────────────────────────────────────────────────────────────
export function detectEventFromInput(
  message: string,
  currentState: ConversationMachineState,
  metadata?: {
    selectedServiceId?: string;
    selectedServiceName?: string;
    selectedDate?: string;
    selectedTime?: string;
    selectedProductId?: string;
    selectedProductName?: string;
    quantity?: number;
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
  }
): { event: TransitionEvent | null; data: Partial<MachineContext> } {
  const lowerMsg = message.toLowerCase().trim();

  // Check for explicit cancellation/reset
  if (/^(cancel|never ?mind|start over|reset|forget it)$/i.test(lowerMsg)) {
    return { event: 'RESET', data: {} };
  }

  // Handle metadata-driven events (from UI buttons)
  if (metadata?.selectedServiceId && currentState === 'selecting_service') {
    return {
      event: 'SERVICE_SELECTED',
      data: { serviceId: metadata.selectedServiceId, serviceName: metadata.selectedServiceName || null },
    };
  }
  
  if (metadata?.selectedDate && currentState === 'selecting_date') {
    return {
      event: 'DATE_SELECTED',
      data: { date: metadata.selectedDate },
    };
  }
  
  if (metadata?.selectedTime && currentState === 'selecting_time') {
    return {
      event: 'TIME_SELECTED',
      data: { time: metadata.selectedTime },
    };
  }
  
  if (metadata?.selectedProductId && currentState === 'selecting_product') {
    return {
      event: 'PRODUCT_SELECTED',
      data: { productId: metadata.selectedProductId, productName: metadata.selectedProductName || null },
    };
  }
  
  if (metadata?.quantity && currentState === 'selecting_quantity') {
    return {
      event: 'QUANTITY_SELECTED',
      data: { quantity: metadata.quantity },
    };
  }

  // Check for booking intent from idle
  if (currentState === 'idle') {
    if (/book|schedule|appointment|reserve|sign.?up/i.test(lowerMsg)) {
      return { event: 'START_BOOKING', data: {} };
    }
    if (/buy|purchase|order|want to get|i'd like/i.test(lowerMsg) && !/appointment|book|schedule/i.test(lowerMsg)) {
      return { event: 'START_ORDER', data: {} };
    }
  }

  // Check for confirmation responses
  if (currentState === 'confirming') {
    if (/^(yes|yep|yeah|correct|confirmed?|looks good|that's right|perfect)$/i.test(lowerMsg)) {
      return { event: 'USER_CONFIRMED', data: {} };
    }
    if (/^(no|nope|cancel|wrong|incorrect)$/i.test(lowerMsg)) {
      return { event: 'USER_CANCELLED', data: {} };
    }
  }

  // Check for contact info in collecting_contact state
  if (currentState === 'collecting_contact') {
    const hasName = metadata?.customerName || /(?:my name is|i'm|i am|call me)\s+([A-Z][a-z]+)/i.test(message);
    const hasPhone = metadata?.customerPhone || /(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/.test(message);
    const hasEmail = metadata?.customerEmail || /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/.test(message);
    
    if (hasName && (hasPhone || hasEmail)) {
      return {
        event: 'CONTACT_PROVIDED',
        data: {
          customerName: metadata?.customerName || null,
          customerPhone: metadata?.customerPhone || null,
          customerEmail: metadata?.customerEmail || null,
        },
      };
    }
  }

  return { event: null, data: {} };
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILD STATE MACHINE PROMPT BLOCK
// ─────────────────────────────────────────────────────────────────────────────
export function buildStateMachinePrompt(context: MachineContext): string {
  const stateDescriptions: Record<ConversationMachineState, string> = {
    idle: 'General chat - no active transaction flow',
    selecting_service: 'Waiting for customer to select a service',
    selecting_date: 'Waiting for customer to provide a date',
    selecting_time: 'Waiting for customer to select a time slot',
    selecting_product: 'Waiting for customer to select a product',
    selecting_quantity: 'Waiting for customer to specify quantity',
    collecting_contact: 'Waiting for customer name and phone/email',
    confirming: 'Waiting for customer to confirm the details',
    completed: 'Transaction completed - offer additional help',
  };

  const validEvents = Object.keys(BOOKING_TRANSITIONS[context.state] || {});
  const redirectMsg = getRedirectMessage(context.state, context.flow);

  return `# 📌 CONVERSATION STATE MACHINE (ENFORCED)

## Current State: ${context.state.toUpperCase()}
${stateDescriptions[context.state]}

## Active Flow: ${context.flow ? context.flow.toUpperCase() : 'NONE'}

## Valid Next Events
${validEvents.map(e => `- ${e}`).join('\n') || '- (no valid transitions)'}

## State Rules (NON-NEGOTIABLE)
1. You MUST stay focused on the current state's objective
2. If user goes off-topic, gently redirect them back
3. You CANNOT skip states or jump ahead
4. Each state must be completed before transitioning

${redirectMsg ? `## Redirect Message (use if user goes off-topic)\n"${redirectMsg}"` : ''}

## Collected Data
- Service: ${context.serviceName || '❌ Not selected'}
- Date: ${context.date || '❌ Not selected'}
- Time: ${context.time || '❌ Not selected'}
- Product: ${context.productName || '❌ Not selected'}
- Quantity: ${context.quantity || '❌ Not specified'}
- Name: ${context.customerName || '❌ Not provided'}
- Contact: ${context.customerPhone || context.customerEmail || '❌ Not provided'}

## Expected Input for Current State
${getStateQuestion(context.state, context)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SERIALIZE/DESERIALIZE FOR DATABASE STORAGE
// ─────────────────────────────────────────────────────────────────────────────
export function serializeMachineContext(context: MachineContext): string {
  return JSON.stringify(context);
}

export function deserializeMachineContext(json: string | null): MachineContext {
  if (!json) return createMachineContext();
  
  try {
    const parsed = JSON.parse(json);
    return {
      ...createMachineContext(),
      ...parsed,
    };
  } catch {
    return createMachineContext();
  }
}
