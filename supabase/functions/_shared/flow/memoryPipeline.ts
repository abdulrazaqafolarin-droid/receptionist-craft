// ═══════════════════════════════════════════════════════════════════════════
// MEMORY UPDATE PIPELINE
// Unified memory management: intent → entities → task_state → UI → rules → summary
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
// STEP 1: INTENT DETECTION
// ═══════════════════════════════════════════════════════════════════════════

export type DetectedIntent = 
  | 'greeting'
  | 'book_appointment'
  | 'order_product'
  | 'complaint'
  | 'support'
  | 'ask_info'
  | 'confirm'
  | 'deny'
  | 'cancel'
  | 'farewell'
  | 'acknowledgment'
  | 'general';

export interface IntentResult {
  intent: DetectedIntent;
  confidence: number;
  shouldSwitchFlow: boolean;
  targetFlow: 'booking' | 'ordering' | 'support' | 'none';
}

export function detectIntent(
  message: string, 
  activeTask: ActiveTask | null,
  businessCapabilities: { canBook: boolean; canOrder: boolean }
): IntentResult {
  const lowerMsg = message.toLowerCase().trim();
  
  // Exit/cancel intents (always respected)
  if (/^(cancel|stop|never\s?mind|forget\s?it|start\s?over|new question|something else)$/i.test(lowerMsg)) {
    return { intent: 'cancel', confidence: 0.95, shouldSwitchFlow: true, targetFlow: 'none' };
  }
  
  // Greeting (only if no active flow)
  if (!activeTask?.type && /^(hi|hello|hey|good\s*(morning|afternoon|evening))[\s!.,]*$/i.test(lowerMsg)) {
    return { intent: 'greeting', confidence: 0.9, shouldSwitchFlow: false, targetFlow: 'none' };
  }
  
  // Farewell
  if (/^(bye|goodbye|thanks?\s*bye|see you|take care|that's all)[\s!.,]*$/i.test(lowerMsg)) {
    return { intent: 'farewell', confidence: 0.9, shouldSwitchFlow: false, targetFlow: 'none' };
  }
  
  // Confirmation/Denial
  if (/^(yes|yep|yeah|correct|right|exactly|confirmed?|that's right|perfect|great)[\s!.,]*$/i.test(lowerMsg)) {
    return { intent: 'confirm', confidence: 0.85, shouldSwitchFlow: false, targetFlow: 'none' };
  }
  if (/^(no|nope|not really|that's wrong|incorrect)[\s!.,]*$/i.test(lowerMsg)) {
    return { intent: 'deny', confidence: 0.85, shouldSwitchFlow: false, targetFlow: 'none' };
  }
  
  // Acknowledgment
  const ackWords = ['okay', 'ok', 'kk', 'k', 'sure', 'alright', 'got it', 'cool', 'fine', 'understood', 'i see', 'mhm', 'right', 'sounds good'];
  if (ackWords.some(ack => lowerMsg === ack || lowerMsg === ack + '.' || lowerMsg === ack + '!')) {
    return { intent: 'acknowledgment', confidence: 0.8, shouldSwitchFlow: false, targetFlow: 'none' };
  }
  
  // Booking intent
  if (businessCapabilities.canBook && /book|appointment|schedule|reserve|sign\s*(me\s*)?up|available|when can/i.test(lowerMsg)) {
    // Don't switch if already in booking flow
    if (activeTask?.type === 'booking') {
      return { intent: 'book_appointment', confidence: 0.9, shouldSwitchFlow: false, targetFlow: 'booking' };
    }
    return { intent: 'book_appointment', confidence: 0.9, shouldSwitchFlow: true, targetFlow: 'booking' };
  }
  
  // Order intent
  if (businessCapabilities.canOrder && /buy|purchase|order|get|want\s*to\s*get|i'd\s*like|add\s*to\s*cart|checkout/i.test(lowerMsg)) {
    if (!/appointment|book|schedule/i.test(lowerMsg)) {
      // Don't switch if already in ordering flow
      if (activeTask?.type === 'ordering') {
        return { intent: 'order_product', confidence: 0.9, shouldSwitchFlow: false, targetFlow: 'ordering' };
      }
      return { intent: 'order_product', confidence: 0.9, shouldSwitchFlow: true, targetFlow: 'ordering' };
    }
  }
  
  // Complaint/Support
  if (/complain|unhappy|upset|angry|terrible|awful|worst|frustrated|problem|issue/i.test(lowerMsg)) {
    return { intent: 'complaint', confidence: 0.85, shouldSwitchFlow: true, targetFlow: 'support' };
  }
  if (/help|support|speak\s*to|talk\s*to|human|manager|real\s*person/i.test(lowerMsg)) {
    return { intent: 'support', confidence: 0.85, shouldSwitchFlow: true, targetFlow: 'support' };
  }
  
  // Info request (don't switch if in active flow)
  if (/what|which|tell\s*me|info|price|cost|how\s*much|hours|location/i.test(lowerMsg)) {
    return { 
      intent: 'ask_info', 
      confidence: 0.7, 
      shouldSwitchFlow: false, // Answer briefly, then continue flow
      targetFlow: 'none' 
    };
  }
  
  return { intent: 'general', confidence: 0.5, shouldSwitchFlow: false, targetFlow: 'none' };
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 2: ENTITY EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

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

export function extractEntities(
  message: string,
  services: any[],
  products: any[]
): ExtractedEntities {
  const entities: ExtractedEntities = {};
  const lowerMsg = message.toLowerCase();
  
  // Service matching
  if (services.length > 0) {
    for (const service of services) {
      if (lowerMsg.includes(service.name.toLowerCase())) {
        entities.serviceId = service.id;
        entities.serviceName = service.name;
        break;
      }
    }
  }
  
  // Product matching
  if (products.length > 0) {
    for (const product of products) {
      if (lowerMsg.includes(product.name.toLowerCase())) {
        entities.productId = product.id;
        entities.productName = product.name;
        break;
      }
    }
  }
  
  // Quantity
  const qtyMatch = message.match(/(\d+)\s*(?:pieces?|items?|units?|kg|g|lbs?|of|x)?/i);
  if (qtyMatch) {
    const qty = parseInt(qtyMatch[1]);
    if (qty > 0 && qty <= 100) entities.quantity = qty;
  }
  
  // Date patterns
  const datePatterns = [
    /(?:on\s+)?(?:the\s+)?(\d{1,2})\s*(?:st|nd|rd|th)?\s*(?:of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)/i,
    /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})/i,
    /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/,
    /(today|tomorrow|next\s+week|this\s+week)/i,
    /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
  ];
  for (const pattern of datePatterns) {
    const match = message.match(pattern);
    if (match) {
      entities.date = match[0];
      break;
    }
  }
  
  // Time patterns
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
  
  // Name patterns
  const namePatterns = [
    /(?:my name is|i'm|i am|call me|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)$/,
  ];
  for (const pattern of namePatterns) {
    const match = message.match(pattern);
    if (match) {
      entities.customerName = match[1];
      break;
    }
  }
  
  // Phone
  const phoneMatch = message.match(/(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);
  if (phoneMatch) entities.customerPhone = phoneMatch[1];
  
  // Email
  const emailMatch = message.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) entities.customerEmail = emailMatch[1].toLowerCase();
  
  // Delivery address
  const addressPatterns = [
    /(?:deliver(?:y)?(?:\s+to)?|send(?:\s+to)?|ship(?:\s+to)?|address\s+is|at)\s+(.{10,100})/i,
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
// STEP 3: TASK STATE UPDATE
// ═══════════════════════════════════════════════════════════════════════════

export function updateTaskState(
  task: ActiveTask,
  intent: IntentResult,
  entities: ExtractedEntities
): ActiveTask {
  const updated = JSON.parse(JSON.stringify(task)) as ActiveTask;
  
  // Update entities
  if (entities.serviceId) {
    updated.entities.service.id = entities.serviceId;
    updated.entities.service.name = entities.serviceName || null;
  }
  if (entities.productId && entities.productName) {
    const existingIndex = updated.entities.product_cart.findIndex(p => p.id === entities.productId);
    if (existingIndex >= 0) {
      updated.entities.product_cart[existingIndex].quantity = entities.quantity || 1;
    } else {
      updated.entities.product_cart.push({
        id: entities.productId,
        name: entities.productName,
        quantity: entities.quantity || 1,
        price: null,
      });
    }
  }
  if (entities.date) updated.entities.appointment.date = entities.date;
  if (entities.time) updated.entities.appointment.time = entities.time;
  if (entities.customerName) updated.entities.customer.name = entities.customerName;
  if (entities.customerPhone) updated.entities.customer.phone = entities.customerPhone;
  if (entities.customerEmail) updated.entities.customer.email = entities.customerEmail;
  if (entities.deliveryAddress) updated.entities.delivery_address = entities.deliveryAddress;
  
  // Determine next step based on what's collected
  updated.step = computeNextStep(updated);
  updated.confidence = intent.confidence;
  
  return updated;
}

function computeNextStep(task: ActiveTask): TaskStep {
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
    // Check if quantity is reasonable
    const needsQuantity = task.entities.product_cart.some(p => !p.quantity || p.quantity < 1);
    if (needsQuantity) return 'selecting_quantity';
    if (!task.entities.customer.name || 
        (!task.entities.customer.phone && !task.entities.customer.email)) {
      return 'collecting_contact';
    }
    if (!task.flow_flags.confirmation_shown) return 'confirming';
    return 'completed';
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 4: UI STATE UPDATE
// ═══════════════════════════════════════════════════════════════════════════

export function updateUIState(task: ActiveTask): UIState {
  const ui: UIState = {
    show_services: false,
    show_products: false,
    show_calendar: false,
    show_time_slots: false,
    show_confirmation: false,
  };
  
  if (!task.type) return ui;
  
  switch (task.step) {
    case 'selecting_service':
      ui.show_services = true;
      break;
    case 'selecting_product':
      ui.show_products = true;
      break;
    case 'selecting_date':
      ui.show_calendar = true;
      break;
    case 'selecting_time':
      ui.show_time_slots = true;
      break;
    case 'confirming':
    case 'completed':
      ui.show_confirmation = true;
      break;
  }
  
  return ui;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 5: FLOW FLAGS UPDATE
// ═══════════════════════════════════════════════════════════════════════════

export function updateFlowFlags(
  task: ActiveTask,
  aiReply: string,
  isFirstMessage: boolean
): FlowFlags {
  const flags = { ...task.flow_flags };
  
  // Greeted check
  if (isFirstMessage || /hello|hi|welcome|good\s*(morning|afternoon|evening)/i.test(aiReply)) {
    flags.greeted = true;
  }
  
  // Confirmation shown check
  if (/confirm|all set|ready to|shall I|would you like me to/i.test(aiReply) && 
      (task.step === 'confirming' || task.step === 'completed')) {
    flags.confirmation_shown = true;
  }
  
  // Closing offered check
  if (/anything else|is there anything else|can I help you with anything else/i.test(aiReply)) {
    flags.asked_if_need_more = true;
  }
  
  // Closing sent check
  if (/goodbye|have a great day|take care|thank you for|pleasure/i.test(aiReply)) {
    flags.closing_offered = true;
  }
  
  return flags;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 6: MEMORY SUMMARY GENERATION
// ═══════════════════════════════════════════════════════════════════════════

export function generateSmartSummary(task: ActiveTask, intent: DetectedIntent): TaskMemory {
  const memory: TaskMemory = {
    summary: '',
    last_user_intent: intent,
    emotional_tone: task.memory.emotional_tone || 'neutral',
    pending_info: [],
  };
  
  const parts: string[] = [];
  
  // Task intent
  if (task.type) {
    parts.push(`User intent: ${task.type}`);
  } else {
    parts.push('User intent: browsing/inquiry');
  }
  
  // Collected data
  if (task.type === 'booking') {
    if (task.entities.service.name) {
      parts.push(`Selected service: ${task.entities.service.name}`);
    }
    if (task.entities.appointment.date) {
      parts.push(`Date: ${task.entities.appointment.date}`);
    }
    if (task.entities.appointment.time) {
      parts.push(`Time: ${task.entities.appointment.time}`);
    }
  }
  
  if (task.type === 'ordering' && task.entities.product_cart.length > 0) {
    const products = task.entities.product_cart.map(p => `${p.name} x${p.quantity}`).join(', ');
    parts.push(`Selected products: ${products}`);
  }
  
  if (task.entities.customer.name) {
    parts.push(`Customer: ${task.entities.customer.name}`);
  }
  
  // Current step
  parts.push(`Current step: ${task.step || 'not started'}`);
  
  // Pending info
  if (task.type === 'booking') {
    if (!task.entities.service.id) memory.pending_info.push('service');
    if (!task.entities.appointment.date) memory.pending_info.push('date');
    if (!task.entities.appointment.time) memory.pending_info.push('time');
    if (!task.entities.customer.name) memory.pending_info.push('name');
    if (!task.entities.customer.phone && !task.entities.customer.email) memory.pending_info.push('contact');
  }
  
  if (task.type === 'ordering') {
    if (task.entities.product_cart.length === 0) memory.pending_info.push('product');
    if (!task.entities.customer.name) memory.pending_info.push('name');
    if (!task.entities.customer.phone && !task.entities.customer.email) memory.pending_info.push('contact');
  }
  
  if (memory.pending_info.length > 0) {
    parts.push(`Pending: ${memory.pending_info.join(', ')}`);
  }
  
  memory.summary = parts.join('\n');
  
  return memory;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 7: FULL PIPELINE EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

export interface PipelineResult {
  task: ActiveTask | null;
  intent: IntentResult;
  entities: ExtractedEntities;
  shouldResetFlow: boolean;
}

export function runMemoryPipeline(
  message: string,
  currentTask: ActiveTask | null,
  services: any[],
  products: any[],
  businessCapabilities: { canBook: boolean; canOrder: boolean },
  timezone?: string
): PipelineResult {
  // Step 1: Detect intent
  const intent = detectIntent(message, currentTask, businessCapabilities);
  
  // Step 2: Extract entities
  const entities = extractEntities(message, services, products);
  
  // Handle flow reset
  if (intent.intent === 'cancel' || intent.shouldSwitchFlow && intent.targetFlow === 'none') {
    return {
      task: null,
      intent,
      entities,
      shouldResetFlow: true,
    };
  }
  
  // Initialize or continue task
  let task = currentTask;
  
  if (!task && intent.shouldSwitchFlow && intent.targetFlow !== 'none') {
    // Start new task
    task = createEmptyActiveTask();
    task.type = intent.targetFlow === 'booking' ? 'booking' : 
                intent.targetFlow === 'ordering' ? 'ordering' : null;
    task.started_at = new Date().toISOString();
    task.entities.appointment.timezone = timezone || null;
  }
  
  if (task) {
    // Step 3: Update task state
    task = updateTaskState(task, intent, entities);
    
    // Step 4: Update UI state
    task.ui_state = updateUIState(task);
    
    // Step 6: Generate memory summary
    task.memory = generateSmartSummary(task, intent.intent);
  }
  
  return {
    task,
    intent,
    entities,
    shouldResetFlow: false,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// POST-AI RESPONSE UPDATES (Step 5 - after AI generates response)
// ═══════════════════════════════════════════════════════════════════════════

export function runPostResponsePipeline(
  task: ActiveTask | null,
  aiReply: string,
  isFirstMessage: boolean,
  bookingCompleted: boolean,
  orderCompleted: boolean
): ActiveTask | null {
  if (!task) return null;
  
  const updated = JSON.parse(JSON.stringify(task)) as ActiveTask;
  
  // Step 5: Update flow flags based on AI response
  updated.flow_flags = updateFlowFlags(updated, aiReply, isFirstMessage);
  
  // Mark task complete if booking/order was successful
  if (bookingCompleted || orderCompleted) {
    updated.step = 'completed';
    updated.flow_flags.confirmation_shown = true;
  }
  
  // Regenerate summary after flag updates
  updated.memory = generateSmartSummary(updated, (updated.memory.last_user_intent as DetectedIntent) || 'general');
  
  return updated;
}
