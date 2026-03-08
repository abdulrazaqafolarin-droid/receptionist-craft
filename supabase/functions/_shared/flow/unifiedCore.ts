// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED CONVERSATION CORE
// ═══════════════════════════════════════════════════════════════════════════
// 
// The SINGLE source of truth for all AI receptionist state and logic.
// Consolidates: stateMachine, memoryPipeline, conversationGovernor, taskIntelligence
//
// ARCHITECTURE:
// ┌─────────────────────────────────────────────────────────────────────────┐
// │                    UNIFIED CONVERSATION CORE                            │
// ├─────────────────────────────────────────────────────────────────────────┤
// │  1. INTENT DETECTION (single source)                                    │
// │  2. ENTITY EXTRACTION (single source)                                   │
// │  3. STATE MANAGEMENT (unified ActiveTask)                               │
// │  4. GOVERNOR ENFORCEMENT (pre-LLM validation)                           │
// │  5. PROMPT GENERATION (state-driven instructions)                       │
// └─────────────────────────────────────────────────────────────────────────┘
//
// PRINCIPLES:
// - ONE intent detector
// - ONE state object (ActiveTask)
// - ONE enforcement layer (Governor)
// - STRICT field progression (never skip, never repeat)
// - LOCKED after confirmation
// ═══════════════════════════════════════════════════════════════════════════

import {
  ActiveTask,
  TaskType,
  TaskStep,
  UIState,
  FlowFlags,
  TaskMemory,
  createEmptyActiveTask,
} from "./types.ts";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type UnifiedIntent = 
  | 'greeting'
  | 'farewell'
  | 'book_appointment'
  | 'order_product'
  | 'confirm'
  | 'deny'
  | 'cancel'
  | 'acknowledgment'
  | 'ask_info'
  | 'ask_price'
  | 'ask_hours'
  | 'complaint'
  | 'escalation'
  | 'small_talk'
  | 'general';

export interface UnifiedIntentResult {
  intent: UnifiedIntent;
  confidence: number;
  shouldStartFlow: boolean;
  targetFlow: TaskType;
  shouldCancelFlow: boolean;
}

export interface ExtractedEntities {
  serviceId?: string;
  serviceName?: string;
  productId?: string;
  productName?: string;
  quantity?: number;
  date?: string;
  time?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  deliveryAddress?: string;
}

export interface RequirementCheck {
  complete: boolean;
  missingFields: string[];
  collectedFields: string[];
  nextRequired: string | null;
  validationErrors: string[];
}

export interface GovernorInstruction {
  allowedActions: string[];
  forbiddenActions: string[];
  nextRequiredField: string | null;
  promptInstruction: string;
  shouldConfirm: boolean;
  shouldClose: boolean;
  isLocked: boolean;
}

export interface UnifiedState {
  task: ActiveTask | null;
  rules: {
    greeted: boolean;
    confirmationSent: boolean;
    closingOffered: boolean;
    askedIfNeedMore: boolean;
    locked: boolean;
    topicLock: string | null;
    clarificationSent: boolean;
  };
  lastIntent: UnifiedIntent;
  lastAction: string | null;
}

export interface CoreResult {
  state: UnifiedState;
  intent: UnifiedIntentResult;
  entities: ExtractedEntities;
  requirements: RequirementCheck;
  instruction: GovernorInstruction;
  uiHints: UIState;
  prompt: string;
  isIllegalResponse: boolean;
  illegalReason: string | null;
}

export interface BusinessCapabilities {
  canBook: boolean;
  canOrder: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPO CORRECTIONS
// ═══════════════════════════════════════════════════════════════════════════

const TYPO_MAP: Record<string, string> = {
  'cok': 'Coke', 'coke': 'Coke', 'cofee': 'Coffee', 'coffe': 'Coffee',
  'apointment': 'appointment', 'appointmnt': 'appointment',
  'tommorow': 'tomorrow', 'tomorow': 'tomorrow',
  'wenesday': 'Wednesday', 'wensday': 'Wednesday', 'thurday': 'Thursday',
  'fone': 'phone', 'adress': 'address', 'plz': 'please', 'pls': 'please',
  'thx': 'thanks', 'tnx': 'thanks', 'ur': 'your', 'u': 'you',
};

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1: UNIFIED INTENT DETECTION (SINGLE SOURCE)
// ═══════════════════════════════════════════════════════════════════════════

export function detectUnifiedIntent(
  message: string,
  currentTask: ActiveTask | null,
  capabilities: BusinessCapabilities,
  isFirstMessage: boolean
): UnifiedIntentResult {
  const lowerMsg = message.toLowerCase().trim();
  
  // PRIORITY 1: Cancel/Exit (always respected)
  if (/^(cancel|stop|never\s?mind|forget\s?it|start\s?over|quit|exit|new\s?question|something\s?else)$/i.test(lowerMsg)) {
    return { intent: 'cancel', confidence: 0.95, shouldStartFlow: false, targetFlow: null, shouldCancelFlow: true };
  }
  
  // PRIORITY 2: Greeting (only on first message with no active task)
  if (isFirstMessage && !currentTask && /^(hi|hello|hey|good\s*(morning|afternoon|evening))[\s!.,]*$/i.test(lowerMsg)) {
    return { intent: 'greeting', confidence: 0.9, shouldStartFlow: false, targetFlow: null, shouldCancelFlow: false };
  }
  
  // PRIORITY 3: Farewell
  if (/^(bye|goodbye|thanks?\s*bye|see you|take care|that's\s*all|no\s*thanks?|nothing\s*else|i'm\s*good|all\s*set|done)[\s!.,]*$/i.test(lowerMsg)) {
    return { intent: 'farewell', confidence: 0.9, shouldStartFlow: false, targetFlow: null, shouldCancelFlow: false };
  }
  
  // PRIORITY 4: Confirmation/Denial (critical for flow progression)
  if (/^(yes|yep|yeah|correct|right|exactly|confirmed?|that's\s*right|perfect|great|sure|ok|okay)[\s!.,]*$/i.test(lowerMsg)) {
    return { intent: 'confirm', confidence: 0.9, shouldStartFlow: false, targetFlow: null, shouldCancelFlow: false };
  }
  if (/^(no|nope|not\s*really|that's\s*wrong|incorrect|wrong|nah)[\s!.,]*$/i.test(lowerMsg)) {
    return { intent: 'deny', confidence: 0.9, shouldStartFlow: false, targetFlow: null, shouldCancelFlow: false };
  }
  
  // PRIORITY 5: Acknowledgment (filler responses)
  const ackWords = ['okay', 'ok', 'kk', 'k', 'sure', 'alright', 'got it', 'cool', 'fine', 'understood', 'i see', 'mhm', 'sounds good'];
  if (ackWords.some(ack => lowerMsg === ack || lowerMsg === ack + '.' || lowerMsg === ack + '!')) {
    return { intent: 'acknowledgment', confidence: 0.85, shouldStartFlow: false, targetFlow: null, shouldCancelFlow: false };
  }
  
  // PRIORITY 6: Booking intent
  if (capabilities.canBook && /book|appointment|schedule|reserve|sign\s*up|available|when\s*can/i.test(lowerMsg)) {
    const alreadyInBooking = currentTask?.type === 'booking';
    return { 
      intent: 'book_appointment', 
      confidence: 0.9, 
      shouldStartFlow: !alreadyInBooking, 
      targetFlow: 'booking', 
      shouldCancelFlow: false 
    };
  }
  
  // PRIORITY 7: Order intent
  if (capabilities.canOrder && /buy|purchase|order|get|want|i'd\s*like|add\s*to\s*cart|checkout/i.test(lowerMsg)) {
    if (!/appointment|book|schedule/i.test(lowerMsg)) {
      const alreadyInOrdering = currentTask?.type === 'ordering';
      return { 
        intent: 'order_product', 
        confidence: 0.9, 
        shouldStartFlow: !alreadyInOrdering, 
        targetFlow: 'ordering', 
        shouldCancelFlow: false 
      };
    }
  }
  
  // PRIORITY 8: Escalation
  if (/speak\s*to|talk\s*to|human|manager|real\s*person|live\s*agent/i.test(lowerMsg)) {
    return { intent: 'escalation', confidence: 0.85, shouldStartFlow: false, targetFlow: null, shouldCancelFlow: false };
  }
  
  // PRIORITY 9: Complaint
  if (/complain|unhappy|upset|angry|terrible|awful|worst|frustrated|problem|issue/i.test(lowerMsg)) {
    return { intent: 'complaint', confidence: 0.85, shouldStartFlow: false, targetFlow: null, shouldCancelFlow: false };
  }
  
  // PRIORITY 10: Info requests (don't break active flow)
  if (/price|cost|how\s*much/i.test(lowerMsg)) {
    return { intent: 'ask_price', confidence: 0.75, shouldStartFlow: false, targetFlow: null, shouldCancelFlow: false };
  }
  if (/hour|open|close|when|timing/i.test(lowerMsg)) {
    return { intent: 'ask_hours', confidence: 0.75, shouldStartFlow: false, targetFlow: null, shouldCancelFlow: false };
  }
  if (/what|where|tell\s*me|info/i.test(lowerMsg)) {
    return { intent: 'ask_info', confidence: 0.7, shouldStartFlow: false, targetFlow: null, shouldCancelFlow: false };
  }
  
  // PRIORITY 11: Small talk
  if (/how\s*are\s*you|what's\s*up|nice\s*to\s*meet/i.test(lowerMsg)) {
    return { intent: 'small_talk', confidence: 0.6, shouldStartFlow: false, targetFlow: null, shouldCancelFlow: false };
  }
  
  // DEFAULT: General (continue current flow if active)
  return { intent: 'general', confidence: 0.5, shouldStartFlow: false, targetFlow: null, shouldCancelFlow: false };
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 2: UNIFIED ENTITY EXTRACTION (SINGLE SOURCE)
// ═══════════════════════════════════════════════════════════════════════════

export function extractUnifiedEntities(
  message: string,
  services: Array<{ id: string; name: string; duration_minutes?: number; price?: number }>,
  products: Array<{ id: string; name: string; price?: number }>
): ExtractedEntities {
  const entities: ExtractedEntities = {};
  const lowerMsg = message.toLowerCase();
  
  // Clean input first
  let cleanedMsg = message;
  const words = cleanedMsg.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const lowerWord = words[i].toLowerCase().replace(/[.,!?]/g, '');
    if (TYPO_MAP[lowerWord]) {
      words[i] = TYPO_MAP[lowerWord];
    }
  }
  cleanedMsg = words.join(' ');
  
  // Service matching
  for (const service of services) {
    if (lowerMsg.includes(service.name.toLowerCase())) {
      entities.serviceId = service.id;
      entities.serviceName = service.name;
      break;
    }
  }
  
  // Product matching
  for (const product of products) {
    if (lowerMsg.includes(product.name.toLowerCase())) {
      entities.productId = product.id;
      entities.productName = product.name;
      break;
    }
  }
  
  // Quantity extraction
  const qtyMatch = message.match(/(\d+)\s*(?:pieces?|items?|units?|kg|g|lbs?|of|x)?/i);
  if (qtyMatch) {
    const qty = parseInt(qtyMatch[1]);
    if (qty > 0 && qty <= 100) entities.quantity = qty;
  }
  
  // Date extraction
  const datePatterns = [
    /(today|tomorrow|next\s+week|this\s+week)/i,
    /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    /(\d{1,2})\s*(?:st|nd|rd|th)?\s*(?:of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)/i,
    /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/,
  ];
  for (const pattern of datePatterns) {
    const match = message.match(pattern);
    if (match) {
      entities.date = match[0];
      break;
    }
  }
  
  // Time extraction
  const timePatterns = [
    /(\d{1,2}):(\d{2})\s*(am|pm)?/i,
    /(\d{1,2})\s*(am|pm)/i,
    /(morning|afternoon|evening|noon)/i,
  ];
  for (const pattern of timePatterns) {
    const match = message.match(pattern);
    if (match) {
      entities.time = match[0];
      break;
    }
  }
  
  // Name extraction
  const namePatterns = [
    /(?:my\s+name\s+is|i'm|i\s+am|call\s+me|this\s+is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)$/,
  ];
  for (const pattern of namePatterns) {
    const match = message.match(pattern);
    if (match) {
      entities.customerName = match[1];
      break;
    }
  }
  
  // Phone extraction
  const phoneMatch = message.match(/(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);
  if (phoneMatch) entities.customerPhone = phoneMatch[1];
  
  // Email extraction
  const emailMatch = message.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) entities.customerEmail = emailMatch[1].toLowerCase();
  
  // Address extraction
  const addressPatterns = [
    /(?:deliver(?:y)?(?:\s+to)?|send(?:\s+to)?|address\s+is|at)\s+(.{10,100})/i,
  ];
  for (const pattern of addressPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      entities.deliveryAddress = match[1].trim();
      break;
    }
  }
  
  return entities;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3: UNIFIED STATE UPDATE
// ═══════════════════════════════════════════════════════════════════════════

export function updateUnifiedState(
  currentState: UnifiedState,
  intent: UnifiedIntentResult,
  entities: ExtractedEntities,
  timezone?: string
): UnifiedState {
  const newState = JSON.parse(JSON.stringify(currentState)) as UnifiedState;
  newState.lastIntent = intent.intent;
  
  // Handle flow cancellation
  if (intent.shouldCancelFlow) {
    newState.task = null;
    newState.rules.topicLock = null;
    newState.rules.locked = false;
    return newState;
  }
  
  // Start new flow if needed
  if (intent.shouldStartFlow && intent.targetFlow) {
    newState.task = createEmptyActiveTask();
    newState.task.type = intent.targetFlow;
    newState.task.started_at = new Date().toISOString();
    newState.task.step = intent.targetFlow === 'booking' ? 'selecting_service' : 'selecting_product';
    if (timezone) newState.task.entities.appointment.timezone = timezone;
    newState.rules.topicLock = intent.targetFlow;
  }
  
  // Update task with new entities
  if (newState.task) {
    // Service entity
    if (entities.serviceId) {
      newState.task.entities.service.id = entities.serviceId;
      newState.task.entities.service.name = entities.serviceName || null;
    }
    
    // Appointment entity
    if (entities.date) newState.task.entities.appointment.date = entities.date;
    if (entities.time) newState.task.entities.appointment.time = entities.time;
    
    // Product cart
    if (entities.productId && entities.productName) {
      const existingIdx = newState.task.entities.product_cart.findIndex(p => p.id === entities.productId);
      if (existingIdx >= 0) {
        newState.task.entities.product_cart[existingIdx].quantity = entities.quantity || 1;
      } else {
        newState.task.entities.product_cart.push({
          id: entities.productId,
          name: entities.productName,
          quantity: entities.quantity || 1,
          price: null,
        });
      }
    }
    
    // Customer entity
    if (entities.customerName) newState.task.entities.customer.name = entities.customerName;
    if (entities.customerPhone) newState.task.entities.customer.phone = entities.customerPhone;
    if (entities.customerEmail) newState.task.entities.customer.email = entities.customerEmail;
    if (entities.deliveryAddress) newState.task.entities.delivery_address = entities.deliveryAddress;
    
    // Recalculate step
    newState.task.step = computeTaskStep(newState.task);
    newState.task.memory.pending_info = computePendingInfo(newState.task);
    
    // Handle confirmation
    if (intent.intent === 'confirm' && newState.task.step === 'confirming') {
      newState.task.flow_flags.confirmation_shown = true;
      newState.task.step = 'completed';
      newState.rules.confirmationSent = true;
      newState.rules.locked = true; // LOCK after confirmation
    }
  }
  
  // Update rules based on intent
  if (intent.intent === 'greeting') {
    newState.rules.greeted = true;
  }
  if (intent.intent === 'farewell') {
    newState.rules.closingOffered = true;
  }
  
  // Clarification tracking: if intent is ambiguous/general, mark that we'll ask
  // If intent becomes clear after a clarification, reset the flag
  if (intent.intent === 'general' && intent.confidence < 0.6) {
    // Low confidence — will trigger clarification in governor
    if (newState.rules.clarificationSent) {
      // Already asked once — governor will assume and proceed, then reset
      newState.rules.clarificationSent = false; // Reset after second attempt
    } else {
      newState.rules.clarificationSent = true; // Mark that we're about to ask
    }
  } else if (intent.confidence >= 0.7) {
    // Clear intent — reset clarification state
    newState.rules.clarificationSent = false;
  }
  
  return newState;
}

function computeTaskStep(task: ActiveTask): TaskStep {
  if (task.type === 'booking') {
    if (!task.entities.service.id) return 'selecting_service';
    if (!task.entities.appointment.date) return 'selecting_date';
    if (!task.entities.appointment.time) return 'selecting_time';
    if (!task.entities.customer.name || 
        (!task.entities.customer.phone && !task.entities.customer.email)) {
      return 'collecting_contact';
    }
    if (!task.flow_flags.confirmation_shown) return 'confirming';
    return 'completed';
  }
  
  if (task.type === 'ordering') {
    if (task.entities.product_cart.length === 0) return 'selecting_product';
    if (task.entities.product_cart.some(p => !p.quantity || p.quantity < 1)) return 'selecting_quantity';
    if (!task.entities.customer.name || 
        (!task.entities.customer.phone && !task.entities.customer.email)) {
      return 'collecting_contact';
    }
    if (!task.flow_flags.confirmation_shown) return 'confirming';
    return 'completed';
  }
  
  return null;
}

function computePendingInfo(task: ActiveTask): string[] {
  const pending: string[] = [];
  
  if (task.type === 'booking') {
    if (!task.entities.service.id) pending.push('service');
    if (!task.entities.appointment.date) pending.push('date');
    if (!task.entities.appointment.time) pending.push('time');
    if (!task.entities.customer.name) pending.push('name');
    if (!task.entities.customer.phone && !task.entities.customer.email) pending.push('contact');
  } else if (task.type === 'ordering') {
    if (task.entities.product_cart.length === 0) pending.push('product');
    if (!task.entities.customer.name) pending.push('name');
    if (!task.entities.customer.phone && !task.entities.customer.email) pending.push('contact');
  }
  
  return pending;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 4: REQUIREMENT CHECKER
// ═══════════════════════════════════════════════════════════════════════════

export function checkUnifiedRequirements(task: ActiveTask | null): RequirementCheck {
  const result: RequirementCheck = {
    complete: false,
    missingFields: [],
    collectedFields: [],
    nextRequired: null,
    validationErrors: [],
  };
  
  if (!task || !task.type) return result;
  
  if (task.type === 'booking') {
    // Service
    if (task.entities.service.id) result.collectedFields.push('service');
    else result.missingFields.push('service');
    
    // Date
    if (task.entities.appointment.date) result.collectedFields.push('date');
    else result.missingFields.push('date');
    
    // Time
    if (task.entities.appointment.time) result.collectedFields.push('time');
    else result.missingFields.push('time');
    
    // Name
    if (task.entities.customer.name) result.collectedFields.push('name');
    else result.missingFields.push('name');
    
    // Contact
    if (task.entities.customer.phone || task.entities.customer.email) result.collectedFields.push('contact');
    else result.missingFields.push('contact');
  }
  
  if (task.type === 'ordering') {
    // Product
    if (task.entities.product_cart.length > 0) {
      result.collectedFields.push('product');
      if (task.entities.product_cart.every(p => p.quantity && p.quantity > 0)) {
        result.collectedFields.push('quantity');
      } else {
        result.missingFields.push('quantity');
      }
    } else {
      result.missingFields.push('product');
    }
    
    // Name
    if (task.entities.customer.name) result.collectedFields.push('name');
    else result.missingFields.push('name');
    
    // Contact
    if (task.entities.customer.phone || task.entities.customer.email) result.collectedFields.push('contact');
    else result.missingFields.push('contact');
  }
  
  // Validation
  if (task.entities.customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(task.entities.customer.email)) {
    result.validationErrors.push('Invalid email format');
  }
  
  result.complete = result.missingFields.length === 0 && result.validationErrors.length === 0;
  result.nextRequired = result.missingFields[0] || null;
  
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 5: GOVERNOR INSTRUCTION GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

export function generateGovernorInstruction(
  state: UnifiedState,
  requirements: RequirementCheck
): GovernorInstruction {
  const instruction: GovernorInstruction = {
    allowedActions: [],
    forbiddenActions: [],
    nextRequiredField: requirements.nextRequired,
    promptInstruction: '',
    shouldConfirm: false,
    shouldClose: false,
    isLocked: state.rules.locked,
  };
  
  // FORBIDDEN: Never re-confirm if already confirmed
  if (state.rules.confirmationSent) {
    instruction.forbiddenActions.push('summarize_again');
    instruction.forbiddenActions.push('re_confirm_details');
    instruction.forbiddenActions.push('repeat_totals');
  }
  
  // FORBIDDEN: Never ask for already collected data
  requirements.collectedFields.forEach(field => {
    instruction.forbiddenActions.push(`ask_for_${field}`);
  });
  
  // FORBIDDEN: Never re-greet if already greeted
  if (state.rules.greeted) {
    instruction.forbiddenActions.push('greet_again');
    instruction.forbiddenActions.push('introduce_self');
  }
  
  // If LOCKED after confirmation
  if (state.rules.locked) {
    instruction.allowedActions.push('ask_if_need_more_help');
    instruction.allowedActions.push('close_conversation');
    instruction.promptInstruction = 'Confirmation already sent. Ask if they need anything else, or close warmly.';
    return instruction;
  }
  
  // AMBIGUITY HANDLING — Clarification Protocol
  if (state.lastIntent === 'ambiguous' as any || state.lastIntent === 'general') {
    if (!state.rules.clarificationSent) {
      instruction.allowedActions.push('ask_clarifying_question');
      instruction.forbiddenActions.push('guess_intent', 'start_task_without_confirmation');
      instruction.promptInstruction = 'The customer\'s message is unclear. Ask ONE short, warm, context-aware clarifying question using your knowledge of the business. Do NOT guess and proceed.';
      return instruction;
    } else {
      // Already asked for clarification once — assume and proceed
      instruction.allowedActions.push('assume_and_proceed', 'answer_question');
      instruction.promptInstruction = 'You already asked for clarification. Make a reasonable assumption, state it out loud (e.g. "I\'ll take that as..."), and proceed. Do NOT ask another clarifying question.';
      return instruction;
    }
  }

  // No active task
  if (!state.task || !state.task.type) {
    instruction.allowedActions.push('ask_how_to_help');
    instruction.allowedActions.push('answer_question');
    instruction.promptInstruction = 'No active task. Help start a booking or order, or answer questions.';
    return instruction;
  }
  
  // STEP PROGRESSION
  const task = state.task;
  if (task.type === 'booking') {
    switch (requirements.nextRequired) {
      case 'service':
        instruction.allowedActions.push('ask_for_service', 'present_services');
        instruction.promptInstruction = 'Ask which service they want. Show options.';
        break;
      case 'date':
        instruction.allowedActions.push('ask_for_date');
        instruction.promptInstruction = 'Ask what date works for them.';
        break;
      case 'time':
        instruction.allowedActions.push('ask_for_time');
        instruction.promptInstruction = 'Ask what time they prefer.';
        break;
      case 'name':
        instruction.allowedActions.push('ask_for_name');
        instruction.promptInstruction = 'Ask for their name.';
        break;
      case 'contact':
        instruction.allowedActions.push('ask_for_contact');
        instruction.promptInstruction = 'Ask for phone or email.';
        break;
      case null:
        if (!state.rules.confirmationSent) {
          instruction.shouldConfirm = true;
          instruction.allowedActions.push('summarize_and_confirm');
          instruction.promptInstruction = 'All info collected. Summarize ONCE and ask for confirmation.';
        }
        break;
    }
  }
  
  if (task.type === 'ordering') {
    switch (requirements.nextRequired) {
      case 'product':
        instruction.allowedActions.push('ask_for_product', 'present_products');
        instruction.promptInstruction = 'Ask which product they want. Show options.';
        break;
      case 'quantity':
        instruction.allowedActions.push('ask_for_quantity');
        instruction.promptInstruction = 'Ask how many they want.';
        break;
      case 'name':
        instruction.allowedActions.push('ask_for_name');
        instruction.promptInstruction = 'Ask for their name.';
        break;
      case 'contact':
        instruction.allowedActions.push('ask_for_contact');
        instruction.promptInstruction = 'Ask for phone or email.';
        break;
      case null:
        if (!state.rules.confirmationSent) {
          instruction.shouldConfirm = true;
          instruction.allowedActions.push('summarize_and_confirm');
          instruction.promptInstruction = 'All info collected. Summarize ONCE and ask for confirmation.';
        }
        break;
    }
  }
  
  return instruction;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 6: UI HINTS GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

export function generateUIHints(task: ActiveTask | null): UIState {
  const hints: UIState = {
    show_services: false,
    show_products: false,
    show_calendar: false,
    show_time_slots: false,
    show_confirmation: false,
  };
  
  if (!task || !task.type) return hints;
  
  switch (task.step) {
    case 'selecting_service':
      hints.show_services = true;
      break;
    case 'selecting_product':
      hints.show_products = true;
      break;
    case 'selecting_date':
      hints.show_calendar = true;
      break;
    case 'selecting_time':
      hints.show_time_slots = true;
      break;
    case 'confirming':
    case 'completed':
      hints.show_confirmation = true;
      break;
  }
  
  return hints;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 7: GOVERNOR PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════

export function buildUnifiedGovernorPrompt(
  state: UnifiedState,
  requirements: RequirementCheck,
  instruction: GovernorInstruction
): string {
  const parts: string[] = [];
  
  parts.push(`# 🔒 CONVERSATION GOVERNOR — STATE-DRIVEN EXECUTION (HIGHEST PRIORITY)`);
  parts.push(`
You are NOT a free-chat assistant.
You are a STATE-DRIVEN AI receptionist operating inside a CONTROLLED WORKFLOW.
Your job is to execute the NEXT VALID STEP in a task, NOT to improvise conversation.

## 🧱 CURRENT STATE
\`\`\`
Task Type: ${state.task?.type || 'none'}
Current Step: ${state.task?.step || 'idle'}
Locked: ${state.rules.locked ? 'YES (NO CHANGES ALLOWED)' : 'NO'}
Topic Lock: ${state.rules.topicLock || 'none'}
\`\`\`

## 📋 FIELD STATUS
| Field | Status |
|-------|--------|
${requirements.collectedFields.map(f => `| ${f} | ✅ COLLECTED |`).join('\n')}
${requirements.missingFields.map(f => `| ${f} | ❌ MISSING |`).join('\n')}

## ✅ ALLOWED ACTIONS
${instruction.allowedActions.map(a => `- ${a}`).join('\n') || '- None specified'}

## 🚫 FORBIDDEN ACTIONS (VIOLATION = FAILURE)
${instruction.forbiddenActions.map(a => `- ❌ ${a}`).join('\n') || '- None specified'}

## 🎯 NEXT REQUIRED FIELD
**${requirements.nextRequired || 'CONFIRMATION (all fields collected)'}**

## 📌 YOUR INSTRUCTION
${instruction.promptInstruction}

## 🔒 CRITICAL RULES

1. **MISSING FIELD RULE**: You may ONLY ask about: ${requirements.nextRequired || 'nothing (confirm order)'}
   - NEVER ask for data already in collectedFields
   - NEVER skip ahead to other missing fields

2. **NO REPEATED CONFIRMATIONS**: ${state.rules.confirmationSent ? 'Confirmation ALREADY sent. DO NOT summarize again.' : 'Confirmation not yet sent.'}

3. **TOPIC LOCK**: ${state.rules.topicLock ? `Locked to: ${state.rules.topicLock}. Brief answers to off-topic, then redirect.` : 'No lock.'}

4. **RESPONSE STYLE**:
   - Short and direct
   - Professional
   - NO long paragraphs
   - NO repeated phrasing

5. **CLOSING RULES**:
   - If user says "bye", "no thanks", "that's all", "done" → Give ONE warm closing and STOP
   - Do NOT re-summarize after confirmation
   - Do NOT ask for more help repeatedly
`);

  // Add collected data summary
  if (state.task) {
    parts.push(`\n## 📊 COLLECTED DATA (DO NOT RE-ASK)`);
    if (state.task.entities.service.name) parts.push(`- Service: ${state.task.entities.service.name}`);
    if (state.task.entities.appointment.date) parts.push(`- Date: ${state.task.entities.appointment.date}`);
    if (state.task.entities.appointment.time) parts.push(`- Time: ${state.task.entities.appointment.time}`);
    if (state.task.entities.product_cart.length > 0) {
      const products = state.task.entities.product_cart.map(p => `${p.name} x${p.quantity}`).join(', ');
      parts.push(`- Products: ${products}`);
    }
    if (state.task.entities.customer.name) parts.push(`- Name: ${state.task.entities.customer.name}`);
    if (state.task.entities.customer.phone) parts.push(`- Phone: ${state.task.entities.customer.phone}`);
    if (state.task.entities.customer.email) parts.push(`- Email: ${state.task.entities.customer.email}`);
  }

  return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT: runUnifiedCore
// ═══════════════════════════════════════════════════════════════════════════

export function runUnifiedCore(
  message: string,
  currentState: UnifiedState | null,
  services: Array<{ id: string; name: string; duration_minutes?: number; price?: number }>,
  products: Array<{ id: string; name: string; price?: number }>,
  capabilities: BusinessCapabilities,
  isFirstMessage: boolean,
  timezone?: string
): CoreResult {
  // Initialize state if null
  const state: UnifiedState = currentState || {
    task: null,
    rules: {
      greeted: false,
      confirmationSent: false,
      closingOffered: false,
      askedIfNeedMore: false,
      locked: false,
      topicLock: null,
      clarificationSent: false,
    },
    lastIntent: 'general',
    lastAction: null,
  };
  
  // Step 1: Detect intent
  const intent = detectUnifiedIntent(message, state.task, capabilities, isFirstMessage);
  
  // Step 2: Extract entities
  const entities = extractUnifiedEntities(message, services, products);
  
  // Step 3: Update state
  const newState = updateUnifiedState(state, intent, entities, timezone);
  
  // Step 4: Check requirements
  const requirements = checkUnifiedRequirements(newState.task);
  
  // Step 5: Generate governor instruction
  const instruction = generateGovernorInstruction(newState, requirements);
  
  // Step 6: Generate UI hints
  const uiHints = generateUIHints(newState.task);
  
  // Step 7: Build governor prompt
  const prompt = buildUnifiedGovernorPrompt(newState, requirements, instruction);
  
  // Check for illegal response conditions
  let isIllegalResponse = false;
  let illegalReason: string | null = null;
  
  if (newState.rules.locked && intent.intent !== 'farewell' && intent.intent !== 'cancel') {
    // After confirmation, only allow closing actions
    if (!['acknowledgment', 'farewell', 'general'].includes(intent.intent)) {
      isIllegalResponse = true;
      illegalReason = 'Task locked after confirmation. Only closing actions allowed.';
    }
  }
  
  return {
    state: newState,
    intent,
    entities,
    requirements,
    instruction,
    uiHints,
    prompt,
    isIllegalResponse,
    illegalReason,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE SERIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

export function serializeUnifiedState(state: UnifiedState): string {
  return JSON.stringify(state);
}

export function deserializeUnifiedState(json: string | null | undefined): UnifiedState | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as UnifiedState;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════

export function createEmptyUnifiedState(): UnifiedState {
  return {
    task: null,
    rules: {
      greeted: false,
      confirmationSent: false,
      closingOffered: false,
      askedIfNeedMore: false,
      locked: false,
      topicLock: null,
      clarificationSent: false,
    },
    lastIntent: 'general',
    lastAction: null,
  };
}
