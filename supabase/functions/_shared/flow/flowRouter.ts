// ═══════════════════════════════════════════════════════════════════════════
// FLOW ROUTER - Routes intents to appropriate flows
// ═══════════════════════════════════════════════════════════════════════════

import {
  ConversationState,
  FlowType,
  FlowStep,
  TopicShiftSignal,
  EXPLICIT_RESET_CUES,
  BLOCKING_STEPS,
} from "./types.ts";

export interface IntentRouting {
  flowType: FlowType;
  initialStep: FlowStep;
  shouldStartFlow: boolean;
  shouldResetCurrentFlow: boolean;
  topicShift: TopicShiftSignal | null;
}

// Detect explicit topic reset cues
function detectExplicitReset(message: string): boolean {
  const lowerMsg = message.toLowerCase();
  return EXPLICIT_RESET_CUES.some(cue => lowerMsg.includes(cue));
}

// Check if current step should block topic shifts
function isBlockingStep(step: FlowStep): boolean {
  return BLOCKING_STEPS.includes(step);
}

// Detect topic shift signals
export function detectTopicShift(
  message: string,
  currentState: ConversationState,
  detectedIntent: string
): TopicShiftSignal | null {
  const lowerMsg = message.toLowerCase();

  // Signal A: Explicit reset cues
  if (detectExplicitReset(message)) {
    if (isBlockingStep(currentState.flow_step)) {
      return {
        type: 'explicit',
        confidence: 0.95,
        shouldBlock: true,
        blockReason: 'User is in a critical flow step. Confirm before switching.',
      };
    }
    return {
      type: 'explicit',
      confidence: 0.95,
      shouldBlock: false,
    };
  }

  // Signal B: Intent mismatch (e.g., ordering during booking flow)
  const isBookingIntent = ['book_appointment', 'reschedule'].includes(detectedIntent);
  const isOrderIntent = detectedIntent === 'order_product';
  
  if (currentState.active_flow === 'SERVICE' && isOrderIntent) {
    if (isBlockingStep(currentState.flow_step)) {
      return {
        type: 'inferred',
        confidence: 0.8,
        newTopic: 'ordering',
        shouldBlock: true,
        blockReason: 'Booking in progress. Ask user to confirm switch.',
      };
    }
    // PARK MODE: Allow topic switch but save current slots as parkedSlots for resume
    return {
      type: 'inferred',
      confidence: 0.8,
      newTopic: 'ordering',
      shouldBlock: false,
      parkSlots: true,
    };
  }

  if (currentState.active_flow === 'PRODUCT' && isBookingIntent) {
    if (isBlockingStep(currentState.flow_step)) {
      return {
        type: 'inferred',
        confidence: 0.8,
        newTopic: 'booking',
        shouldBlock: true,
        blockReason: 'Order in progress. Ask user to confirm switch.',
      };
    }
    // PARK MODE: Allow topic switch but save current slots as parkedSlots for resume
    return {
      type: 'inferred',
      confidence: 0.8,
      newTopic: 'booking',
      shouldBlock: false,
      parkSlots: true,
    };
  }

  return null;
}

// Route intent to appropriate flow
export function routeIntent(
  intent: string,
  currentState: ConversationState,
  message: string
): IntentRouting {
  const topicShift = detectTopicShift(message, currentState, intent);
  
  // Handle booking intents
  if (['book_appointment', 'reschedule'].includes(intent)) {
    const shouldReset = currentState.active_flow === 'PRODUCT' && !topicShift?.shouldBlock;
    return {
      flowType: 'SERVICE',
      initialStep: 'select_service',
      shouldStartFlow: true,
      shouldResetCurrentFlow: shouldReset,
      topicShift,
    };
  }

  // Handle ordering intents
  if (intent === 'order_product') {
    const shouldReset = currentState.active_flow === 'SERVICE' && !topicShift?.shouldBlock;
    return {
      flowType: 'PRODUCT',
      initialStep: 'select_product',
      shouldStartFlow: true,
      shouldResetCurrentFlow: shouldReset,
      topicShift,
    };
  }

  // Handle confirmation intents
  if (intent === 'confirm' && currentState.flow_step === 'confirm') {
    return {
      flowType: currentState.active_flow,
      initialStep: 'complete',
      shouldStartFlow: false,
      shouldResetCurrentFlow: false,
      topicShift: null,
    };
  }

  // Handle denial/cancellation
  if (intent === 'deny' && currentState.active_flow) {
    return {
      flowType: null,
      initialStep: null,
      shouldStartFlow: false,
      shouldResetCurrentFlow: true,
      topicShift: null,
    };
  }

  // Default: continue current flow or stay in discovery
  return {
    flowType: currentState.active_flow,
    initialStep: currentState.flow_step,
    shouldStartFlow: false,
    shouldResetCurrentFlow: false,
    topicShift,
  };
}

// Determine next step in booking flow
export function getNextBookingStep(state: ConversationState): FlowStep {
  const slots = state.slots;
  
  if (!slots.serviceId) return 'select_service';
  if (!slots.date) return 'select_date';
  if (!slots.time) return 'select_time';
  if (!slots.customerName) return 'collect_name';
  if (!slots.customerPhone && !slots.customerEmail) return 'collect_contact';
  if (!state.booking_confirmed) return 'confirm';
  return 'complete';
}

// Determine next step in ordering flow (includes location for delivery)
export function getNextOrderingStep(state: ConversationState, requiresDelivery: boolean = true): FlowStep {
  const slots = state.slots;
  const hasProducts = (slots.selectedProducts && slots.selectedProducts.length > 0) || slots.productId;
  
  if (!hasProducts) return 'select_product';
  if (!slots.quantity && !slots.selectedProducts?.length) return 'select_quantity';
  if (!slots.customerName) return 'collect_name';
  if (!slots.customerPhone && !slots.customerEmail) return 'collect_contact';
  if (requiresDelivery && !slots.deliveryLocation) return 'collect_location';
  if (!state.order_confirmed) return 'confirm';
  return 'complete';
}

// Get appropriate question for current step
export function getStepQuestion(step: FlowStep, flowType: FlowType): string {
  if (!step || !flowType) return "";
  
  const serviceQuestions: Record<string, string> = {
    'select_service': "Which service would you like to book?",
    'select_date': "What day works best for you?",
    'select_time': "What time would you prefer?",
    'collect_name': "What's your name for the booking?",
    'collect_contact': "Please provide your phone number or email for the confirmation.",
    'confirm': "Would you like me to confirm this booking?",
    'complete': "Is there anything else I can help you with today?",
  };
  
  const productQuestions: Record<string, string> = {
    'select_product': "Which product would you like to order?",
    'select_quantity': "How many would you like?",
    'collect_name': "What's your name for the order?",
    'collect_contact': "Please provide your phone number or email so we can contact you about the order.",
    'collect_location': "Where would you like us to deliver your order? Please provide your delivery address.",
    'confirm': "Would you like me to confirm this order?",
    'complete': "Is there anything else I can help you with today?",
  };
  
  if (flowType === 'SERVICE') {
    return serviceQuestions[step] || "";
  }
  
  if (flowType === 'PRODUCT') {
    return productQuestions[step] || "";
  }
  
  return "";
}
