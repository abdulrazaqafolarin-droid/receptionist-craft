// ═══════════════════════════════════════════════════════════════════════════
// @deprecated — CONVERSATION STATE MACHINE (LEGACY)
// ═══════════════════════════════════════════════════════════════════════════
// 
// DEPRECATED as of conversational flow audit (2026-05-10).
// Engine v2 (engine/governor.ts + engine/core.ts) is the single source
// of truth for state tracking. This module is retained only for
// backward compatibility with imports — it is NOT called at runtime.
// See widget-chat/index.ts line ~1955:
//   "Old stateMachine.ts is fully replaced by Engine v2's state tracking."
//
// DO NOT modify. DO NOT use in new code. Will be removed in next cleanup.
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
      return `Absolutely — happy to help with that. By the way, to keep your ${flowName} moving, which service would you like to book?`;
    case 'selecting_date':
      return `Great question — I can help with that. By the way, what day works best for your ${flowName}?`;
    case 'selecting_time':
      return `Happy to help with that. By the way, what time would you prefer for your ${flowName}?`;
    case 'selecting_product':
      return `Sure — I can help with that. By the way, which product are you interested in for this ${flowName}?`;
    case 'selecting_quantity':
      return `Got it — happy to help. By the way, how many would you like to order?`;
    case 'collecting_contact':
      return `Absolutely — I can help with that. By the way, to finish your ${flowName} I just need your name and phone number or email — what should I call you?`;
    case 'confirming':
      return `Great question — happy to help. By the way, once you're ready, can you confirm the details look correct so we can finalize your ${flowName}?`;
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

  // Check for booking intent from idle — EXPANDED natural language triggers
  if (currentState === 'idle') {
    // Booking intent patterns
    if (/book|schedule|appointment|reserve|sign.?up/i.test(lowerMsg)) {
      return { event: 'START_BOOKING', data: {} };
    }
    if (/when can (i|we) (come in|visit|stop by|see you|swing by|drop by)/i.test(lowerMsg)) {
      return { event: 'START_BOOKING', data: {} };
    }
    if (/do you have (any )?(availability|time|opening|slot|free time)/i.test(lowerMsg)) {
      return { event: 'START_BOOKING', data: {} };
    }
    if (/can (i|you).*(fit me in|squeeze me in|see me|take me)/i.test(lowerMsg)) {
      return { event: 'START_BOOKING', data: {} };
    }
    if (/is there (a |an )?(slot|time|opening|spot) (available|free|open)/i.test(lowerMsg)) {
      return { event: 'START_BOOKING', data: {} };
    }
    if (/i('d| would) like to (come in|visit|set up|arrange|plan)/i.test(lowerMsg) && !/order|buy|purchase/i.test(lowerMsg)) {
      return { event: 'START_BOOKING', data: {} };
    }
    if (/set up (an? )?(appointment|visit|session|consultation|meeting)/i.test(lowerMsg)) {
      return { event: 'START_BOOKING', data: {} };
    }
    if (/what (days?|times?) (are|do) (you|the).*(available|open|free)/i.test(lowerMsg)) {
      return { event: 'START_BOOKING', data: {} };
    }
    if (/i (need|want) to (come in|be seen|get an? |set up)/i.test(lowerMsg) && !/order|buy/i.test(lowerMsg)) {
      return { event: 'START_BOOKING', data: {} };
    }
    if (/make (an? )?(appointment|reservation|booking)/i.test(lowerMsg)) {
      return { event: 'START_BOOKING', data: {} };
    }
    
    // Product ordering intent patterns
    if (/buy|purchase|order|want to get|i'd like/i.test(lowerMsg) && !/appointment|book|schedule/i.test(lowerMsg)) {
      return { event: 'START_ORDER', data: {} };
    }
    if (/show me.*(product|item|menu|catalog|what you (have|sell|offer))/i.test(lowerMsg)) {
      return { event: 'START_ORDER', data: {} };
    }
    if (/can i (see|browse|look at|check out).*(product|item|menu|catalog|stock)/i.test(lowerMsg)) {
      return { event: 'START_ORDER', data: {} };
    }
    if (/what('s| is) (available|in stock|on the menu|for sale)/i.test(lowerMsg)) {
      return { event: 'START_ORDER', data: {} };
    }
    if (/do you (sell|carry|stock|have|offer)\s/i.test(lowerMsg) && !/appointment|book/i.test(lowerMsg)) {
      return { event: 'START_ORDER', data: {} };
    }
    if (/looking (to|for).*(buy|purchase|order|pick up|grab)/i.test(lowerMsg)) {
      return { event: 'START_ORDER', data: {} };
    }
    if (/what can i (buy|order|get)/i.test(lowerMsg)) {
      return { event: 'START_ORDER', data: {} };
    }
    if (/what (do you|products?|items?).*(sell|have|offer|carry|stock)/i.test(lowerMsg)) {
      return { event: 'START_ORDER', data: {} };
    }
    if (/place.*(order|purchase)/i.test(lowerMsg)) {
      return { event: 'START_ORDER', data: {} };
    }
    if (/pick up|grab (some|a|the)/i.test(lowerMsg) && !/appointment|book/i.test(lowerMsg)) {
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
1. Acknowledge and answer the user's actual message first
2. After answering, gently resume the current state's objective
3. The current state objective is a preference for guidance, not a hard gate
4. A user question never goes unanswered before returning to the task

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
