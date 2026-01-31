// ═══════════════════════════════════════════════════════════════════════════
// CONVERSATION GOVERNOR MODULE
// State-driven execution control with 4-layer validation
// ═══════════════════════════════════════════════════════════════════════════
// 
// You are not a free-chat assistant.
// You are a state-driven AI receptionist operating inside a controlled workflow.
// Your job is to execute the next valid step in a task, not to improvise.
//
// ARCHITECTURE:
// ├── State Validation
// ├── Missing Field Detection
// ├── Next Legal Step Determination
// ├── Illegal Response Blocking
// └── 4-Layer Validator (Input → Intent → Requirements → Response)
// ═══════════════════════════════════════════════════════════════════════════

import { ActiveTask, TaskStep, TaskType, createEmptyActiveTask, GovernorStateType } from "./types.ts";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

// Re-export GovernorState as alias for GovernorStateType
export type GovernorState = GovernorStateType;

export interface GovernorInstruction {
  allowed_actions: string[];
  forbidden_actions: string[];
  next_required_field: string | null;
  prompt_instruction: string;
  should_confirm: boolean;
  should_close: boolean;
  ui_hints: {
    show_services: boolean;
    show_products: boolean;
    show_calendar: boolean;
    show_time_slots: boolean;
    show_confirmation: boolean;
  };
}

export interface ValidatedInput {
  cleaned: string;
  intent: string;
  confidence: number;
  corrections: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// REQUIRED FIELDS BY FLOW
// ═══════════════════════════════════════════════════════════════════════════

const BOOKING_REQUIRED_FIELDS = ['service', 'date', 'time', 'name', 'contact'];
const ORDER_REQUIRED_FIELDS = ['product', 'quantity', 'name', 'contact'];

// ═══════════════════════════════════════════════════════════════════════════
// TYPO CORRECTIONS (STAGE 1: INPUT CLEANER)
// ═══════════════════════════════════════════════════════════════════════════

const TYPO_CORRECTIONS: Record<string, string> = {
  'cok': 'Coke',
  'coke': 'Coke',
  'cofee': 'Coffee',
  'coffe': 'Coffee',
  'apointment': 'appointment',
  'appointmnt': 'appointment',
  'tommorow': 'tomorrow',
  'tomorow': 'tomorrow',
  'wenesday': 'Wednesday',
  'wensday': 'Wednesday',
  'thurday': 'Thursday',
  'fone': 'phone',
  'adress': 'address',
  'recieve': 'receive',
  'recive': 'receive',
  'plz': 'please',
  'pls': 'please',
  'thx': 'thanks',
  'tnx': 'thanks',
  'ur': 'your',
  'u': 'you',
  'r': 'are',
  'wat': 'what',
  'wht': 'what',
  'gud': 'good',
  'msg': 'message',
  'qty': 'quantity',
  'pcs': 'pieces',
  'mins': 'minutes',
  'hrs': 'hours',
};

// ═══════════════════════════════════════════════════════════════════════════
// STAGE 1: INPUT CLEANER
// Sanitize and normalize user input
// ═══════════════════════════════════════════════════════════════════════════

export function cleanInput(rawInput: string): { cleaned: string; corrections: string[] } {
  if (!rawInput) return { cleaned: '', corrections: [] };
  
  const corrections: string[] = [];
  let cleaned = rawInput.trim();
  
  // Apply typo corrections
  const words = cleaned.split(/\s+/);
  const correctedWords = words.map(word => {
    const lowerWord = word.toLowerCase().replace(/[.,!?]/g, '');
    const punctuation = word.slice(lowerWord.length);
    
    if (TYPO_CORRECTIONS[lowerWord]) {
      corrections.push(`${word} → ${TYPO_CORRECTIONS[lowerWord]}`);
      return TYPO_CORRECTIONS[lowerWord] + punctuation;
    }
    return word;
  });
  
  cleaned = correctedWords.join(' ');
  
  // Remove excessive punctuation
  cleaned = cleaned.replace(/[!?]{3,}/g, '!');
  cleaned = cleaned.replace(/\.{3,}/g, '...');
  
  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ');
  
  return { cleaned, corrections };
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE 2: INTENT CLARIFIER
// Determine and refine user intent after cleaning
// ═══════════════════════════════════════════════════════════════════════════

export interface ClarifiedIntent {
  intent: 'booking' | 'ordering' | 'info' | 'support' | 'confirmation' | 'denial' | 'cancel' | 'small_talk' | 'unknown';
  confidence: number;
  ambiguous: boolean;
  clarification_needed: string | null;
  sub_intent?: string;
}

export function clarifyIntent(
  cleanedInput: string,
  currentFlow: 'booking' | 'ordering' | 'none' | 'support' | 'info',
  businessCapabilities: { canBook: boolean; canOrder: boolean }
): ClarifiedIntent {
  const lowerInput = cleanedInput.toLowerCase();
  
  // Cancel/exit detection (always high priority)
  if (/^(cancel|stop|never\s?mind|forget\s?it|start\s?over|quit|exit)$/i.test(lowerInput)) {
    return { intent: 'cancel', confidence: 0.95, ambiguous: false, clarification_needed: null };
  }
  
  // Confirmation/Denial detection
  if (/^(yes|yep|yeah|correct|right|exactly|confirmed?|that's right|perfect|great|sure|ok|okay)$/i.test(lowerInput)) {
    return { intent: 'confirmation', confidence: 0.9, ambiguous: false, clarification_needed: null };
  }
  if (/^(no|nope|not really|that's wrong|incorrect|wrong|nah)$/i.test(lowerInput)) {
    return { intent: 'denial', confidence: 0.9, ambiguous: false, clarification_needed: null };
  }
  
  // Small talk detection
  if (/^(how are you|what's up|hello|hi|hey|good morning|good afternoon|good evening)$/i.test(lowerInput)) {
    return { intent: 'small_talk', confidence: 0.85, ambiguous: false, clarification_needed: null };
  }
  
  // Booking intent
  if (businessCapabilities.canBook && /book|appointment|schedule|reserve|sign\s*up|available|when can/i.test(lowerInput)) {
    return { intent: 'booking', confidence: 0.9, ambiguous: false, clarification_needed: null };
  }
  
  // Order intent
  if (businessCapabilities.canOrder && /buy|purchase|order|get|want|i'd like|add to cart/i.test(lowerInput)) {
    // If both ordering and booking are possible, check for ambiguity
    if (businessCapabilities.canBook && /service|session/i.test(lowerInput)) {
      return { 
        intent: 'unknown', 
        confidence: 0.5, 
        ambiguous: true, 
        clarification_needed: 'Would you like to book a service or order a product?' 
      };
    }
    return { intent: 'ordering', confidence: 0.9, ambiguous: false, clarification_needed: null };
  }
  
  // Support/complaint intent
  if (/help|support|problem|issue|complaint|speak to|manager|human/i.test(lowerInput)) {
    return { intent: 'support', confidence: 0.85, ambiguous: false, clarification_needed: null };
  }
  
  // Info request
  if (/what|where|when|how much|price|cost|hours|location|tell me/i.test(lowerInput)) {
    return { intent: 'info', confidence: 0.75, ambiguous: false, clarification_needed: null };
  }
  
  // If already in a flow, assume context relevance
  if (currentFlow !== 'none') {
    return { 
      intent: currentFlow as ClarifiedIntent['intent'], 
      confidence: 0.6, 
      ambiguous: false, 
      clarification_needed: null,
      sub_intent: 'context_continuation'
    };
  }
  
  return { intent: 'unknown', confidence: 0.3, ambiguous: true, clarification_needed: null };
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE 3: REQUIREMENT CHECKER
// Ensure all required details are present and valid
// ═══════════════════════════════════════════════════════════════════════════

export interface RequirementCheck {
  complete: boolean;
  missing_fields: string[];
  collected_fields: string[];
  next_required: string | null;
  validation_errors: string[];
}

export function checkRequirements(
  task: ActiveTask | null,
  flow: 'booking' | 'ordering' | 'none'
): RequirementCheck {
  const result: RequirementCheck = {
    complete: false,
    missing_fields: [],
    collected_fields: [],
    next_required: null,
    validation_errors: [],
  };
  
  if (!task || flow === 'none') {
    return result;
  }
  
  if (flow === 'booking') {
    // Check service
    if (task.entities.service.id) {
      result.collected_fields.push('service');
    } else {
      result.missing_fields.push('service');
    }
    
    // Check date
    if (task.entities.appointment.date) {
      result.collected_fields.push('date');
    } else {
      result.missing_fields.push('date');
    }
    
    // Check time
    if (task.entities.appointment.time) {
      result.collected_fields.push('time');
    } else {
      result.missing_fields.push('time');
    }
    
    // Check name
    if (task.entities.customer.name) {
      result.collected_fields.push('name');
    } else {
      result.missing_fields.push('name');
    }
    
    // Check contact (phone or email)
    if (task.entities.customer.phone || task.entities.customer.email) {
      result.collected_fields.push('contact');
    } else {
      result.missing_fields.push('contact');
    }
    
    // Validation
    if (task.entities.customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(task.entities.customer.email)) {
      result.validation_errors.push('Invalid email format');
    }
    if (task.entities.customer.phone && !/^[\d\s\-+()]{7,20}$/.test(task.entities.customer.phone)) {
      result.validation_errors.push('Invalid phone format');
    }
  }
  
  if (flow === 'ordering') {
    // Check product
    if (task.entities.product_cart.length > 0) {
      result.collected_fields.push('product');
      
      // Check quantity
      const hasValidQuantity = task.entities.product_cart.every(p => p.quantity && p.quantity > 0);
      if (hasValidQuantity) {
        result.collected_fields.push('quantity');
      } else {
        result.missing_fields.push('quantity');
      }
    } else {
      result.missing_fields.push('product');
    }
    
    // Check name
    if (task.entities.customer.name) {
      result.collected_fields.push('name');
    } else {
      result.missing_fields.push('name');
    }
    
    // Check contact
    if (task.entities.customer.phone || task.entities.customer.email) {
      result.collected_fields.push('contact');
    } else {
      result.missing_fields.push('contact');
    }
  }
  
  result.complete = result.missing_fields.length === 0 && result.validation_errors.length === 0;
  result.next_required = result.missing_fields[0] || null;
  
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE 4: RESPONSE POLISHER (GENERATES GOVERNOR INSTRUCTION)
// Construct final AI instruction based on validated state
// ═══════════════════════════════════════════════════════════════════════════

export function generateGovernorInstruction(
  task: ActiveTask | null,
  requirements: RequirementCheck,
  intent: ClarifiedIntent,
  conversationRules: GovernorState['conversation_rules']
): GovernorInstruction {
  const instruction: GovernorInstruction = {
    allowed_actions: [],
    forbidden_actions: [],
    next_required_field: requirements.next_required,
    prompt_instruction: '',
    should_confirm: false,
    should_close: false,
    ui_hints: {
      show_services: false,
      show_products: false,
      show_calendar: false,
      show_time_slots: false,
      show_confirmation: false,
    },
  };
  
  // ═══════════════════════════════════════════════════════════════════════
  // FORBIDDEN ACTIONS (UNIVERSAL)
  // ═══════════════════════════════════════════════════════════════════════
  
  // Never re-confirm if already confirmed
  if (conversationRules.confirmation_sent) {
    instruction.forbidden_actions.push('summarize_order_again');
    instruction.forbidden_actions.push('re_confirm_details');
    instruction.forbidden_actions.push('repeat_totals');
  }
  
  // Never ask for already collected data
  requirements.collected_fields.forEach(field => {
    instruction.forbidden_actions.push(`ask_for_${field}`);
  });
  
  // Never re-greet if already greeted
  if (conversationRules.greeted) {
    instruction.forbidden_actions.push('greet_again');
    instruction.forbidden_actions.push('introduce_self');
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // STEP PROGRESSION LOGIC
  // ═══════════════════════════════════════════════════════════════════════
  
  if (!task || !task.type) {
    // No active flow
    instruction.allowed_actions.push('ask_how_to_help');
    instruction.allowed_actions.push('answer_question');
    instruction.prompt_instruction = 'No active task. Help the user start a booking or order, or answer their question.';
    return instruction;
  }
  
  // Task is active - follow step progression
  if (task.type === 'booking') {
    switch (requirements.next_required) {
      case 'service':
        instruction.allowed_actions.push('ask_for_service');
        instruction.allowed_actions.push('present_services');
        instruction.ui_hints.show_services = true;
        instruction.prompt_instruction = 'Ask which service they would like to book. Present options if available.';
        break;
      case 'date':
        instruction.allowed_actions.push('ask_for_date');
        instruction.ui_hints.show_calendar = true;
        instruction.prompt_instruction = 'Ask what date works best for them.';
        break;
      case 'time':
        instruction.allowed_actions.push('ask_for_time');
        instruction.ui_hints.show_time_slots = true;
        instruction.prompt_instruction = 'Ask what time slot they prefer.';
        break;
      case 'name':
        instruction.allowed_actions.push('ask_for_name');
        instruction.prompt_instruction = 'Ask for their name to complete the booking.';
        break;
      case 'contact':
        instruction.allowed_actions.push('ask_for_contact');
        instruction.prompt_instruction = 'Ask for their phone number or email to confirm the booking.';
        break;
      case null:
        // All fields collected - time to confirm
        if (!conversationRules.confirmation_sent) {
          instruction.should_confirm = true;
          instruction.allowed_actions.push('summarize_and_confirm');
          instruction.ui_hints.show_confirmation = true;
          instruction.prompt_instruction = 'Summarize the booking details ONCE and ask for confirmation. Do NOT repeat after this.';
        } else {
          instruction.should_close = true;
          instruction.allowed_actions.push('thank_and_close');
          instruction.prompt_instruction = 'Booking confirmed. Thank them and offer to help with anything else.';
        }
        break;
    }
  }
  
  if (task.type === 'ordering') {
    switch (requirements.next_required) {
      case 'product':
        instruction.allowed_actions.push('ask_for_product');
        instruction.allowed_actions.push('present_products');
        instruction.ui_hints.show_products = true;
        instruction.prompt_instruction = 'Ask what product they would like to order. Present options if available.';
        break;
      case 'quantity':
        instruction.allowed_actions.push('ask_for_quantity');
        instruction.prompt_instruction = 'Ask how many they would like.';
        break;
      case 'name':
        instruction.allowed_actions.push('ask_for_name');
        instruction.prompt_instruction = 'Ask for their name to complete the order.';
        break;
      case 'contact':
        instruction.allowed_actions.push('ask_for_contact');
        instruction.prompt_instruction = 'Ask for their phone number or email to confirm the order.';
        break;
      case null:
        // All fields collected - time to confirm
        if (!conversationRules.confirmation_sent) {
          instruction.should_confirm = true;
          instruction.allowed_actions.push('summarize_and_confirm');
          instruction.ui_hints.show_confirmation = true;
          instruction.prompt_instruction = 'Summarize the order ONCE and ask for confirmation. Do NOT repeat after this.';
        } else {
          instruction.should_close = true;
          instruction.allowed_actions.push('thank_and_close');
          instruction.prompt_instruction = 'Order confirmed. Thank them and offer to help with anything else.';
        }
        break;
    }
  }
  
  return instruction;
}

// ═══════════════════════════════════════════════════════════════════════════
// GOVERNOR STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

export function createGovernorState(): GovernorState {
  return {
    active_flow: 'none',
    current_step: null,
    locked: false,
    topic_lock: null,
    missing_fields: [],
    collected_fields: [],
    conversation_rules: {
      greeted: false,
      confirmation_sent: false,
      closing_sent: false,
      asked_if_need_more: false,
    },
    last_ai_action: null,
  };
}

export function updateGovernorState(
  state: GovernorState,
  task: ActiveTask | null,
  requirements: RequirementCheck
): GovernorState {
  const updated = { ...state };
  
  if (task) {
    updated.active_flow = task.type || 'none';
    updated.current_step = task.step;
    updated.missing_fields = requirements.missing_fields;
    updated.collected_fields = requirements.collected_fields;
    
    // Lock the flow if confirmation has been sent
    if (updated.conversation_rules.confirmation_sent) {
      updated.locked = true;
    }
    
    // Topic lock based on selected service/product
    if (task.entities.service.name) {
      updated.topic_lock = task.entities.service.name;
    } else if (task.entities.product_cart.length > 0) {
      updated.topic_lock = task.entities.product_cart[0].name;
    }
  } else {
    updated.active_flow = 'none';
    updated.current_step = null;
    updated.locked = false;
    updated.topic_lock = null;
    updated.missing_fields = [];
    updated.collected_fields = [];
  }
  
  return updated;
}

// ═══════════════════════════════════════════════════════════════════════════
// FULL GOVERNOR PIPELINE
// Run all 4 stages + generate controlled instruction
// ═══════════════════════════════════════════════════════════════════════════

export interface GovernorResult {
  validatedInput: ValidatedInput;
  clarifiedIntent: ClarifiedIntent;
  requirements: RequirementCheck;
  instruction: GovernorInstruction;
  state: GovernorState;
  isIllegalResponse: boolean;
  illegalReason?: string;
}

export function runGovernor(
  rawInput: string,
  task: ActiveTask | null,
  currentState: GovernorState,
  businessCapabilities: { canBook: boolean; canOrder: boolean }
): GovernorResult {
  // Stage 1: Input Cleaner
  const { cleaned, corrections } = cleanInput(rawInput);
  
  // Stage 2: Intent Clarifier
  const clarifiedIntent = clarifyIntent(cleaned, currentState.active_flow, businessCapabilities);
  
  // Determine flow based on intent
  let effectiveFlow: 'booking' | 'ordering' | 'none' = 
    currentState.active_flow === 'booking' || currentState.active_flow === 'ordering' 
      ? currentState.active_flow 
      : 'none';
  if (clarifiedIntent.intent === 'booking') effectiveFlow = 'booking';
  else if (clarifiedIntent.intent === 'ordering') effectiveFlow = 'ordering';
  else if (clarifiedIntent.intent === 'cancel') effectiveFlow = 'none';
  
  // Stage 3: Requirement Checker
  const requirements = checkRequirements(task, effectiveFlow);
  
  // Update governor state
  const updatedState = updateGovernorState(currentState, task, requirements);
  
  // Stage 4: Generate Instruction
  const instruction = generateGovernorInstruction(task, requirements, clarifiedIntent, updatedState.conversation_rules);
  
  // Check for illegal response patterns
  let isIllegalResponse = false;
  let illegalReason: string | undefined;
  
  // If locked and trying to re-confirm, block it
  if (updatedState.locked && instruction.should_confirm) {
    isIllegalResponse = true;
    illegalReason = 'Task is locked - confirmation already sent. Cannot re-confirm.';
  }
  
  return {
    validatedInput: {
      cleaned,
      intent: clarifiedIntent.intent,
      confidence: clarifiedIntent.confidence,
      corrections,
    },
    clarifiedIntent,
    requirements,
    instruction,
    state: updatedState,
    isIllegalResponse,
    illegalReason,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GOVERNOR SYSTEM PROMPT
// This prompt block enforces the governor rules on the LLM
// ═══════════════════════════════════════════════════════════════════════════

export function buildGovernorPrompt(result: GovernorResult): string {
  const { state, requirements, instruction, clarifiedIntent } = result;
  
  const parts: string[] = [];
  
  parts.push(`
# 🔒 CONVERSATION GOVERNOR (STATE-DRIVEN EXECUTION)

You are NOT a free-chat assistant. You are a state-controlled execution agent.
Your job is to execute the NEXT VALID STEP in a task, not to improvise conversation.

## 📌 CURRENT STATE

- Active Flow: ${state.active_flow}
- Current Step: ${state.current_step || 'not started'}
- Task Locked: ${state.locked ? 'YES - DO NOT RE-CONFIRM' : 'NO'}
- Topic Lock: ${state.topic_lock || 'none'}

## 📊 FIELD STATUS

✅ Collected: ${requirements.collected_fields.join(', ') || 'none'}
❌ Missing: ${requirements.missing_fields.join(', ') || 'none - ready to confirm'}
➡️ Next Required: ${requirements.next_required || 'CONFIRMATION'}

## 🎯 YOUR INSTRUCTION

${instruction.prompt_instruction}

## ✅ ALLOWED ACTIONS
${instruction.allowed_actions.map(a => `- ${a}`).join('\n')}

## 🚫 FORBIDDEN ACTIONS (NEVER DO THESE)
${instruction.forbidden_actions.map(a => `- ${a}`).join('\n')}

## 📜 CORE RULES (NON-NEGOTIABLE)

1. **STATE IS THE AUTHORITY** - Base your reply ONLY on this state data. If memory conflicts with state → state wins.

2. **MISSING FIELD RULE** - You may ONLY ask about the FIRST missing field: "${requirements.next_required || 'none - ready to confirm'}"

3. **NO REPEATED CONFIRMATIONS** - If confirmation_sent = true (${state.conversation_rules.confirmation_sent}), you are FORBIDDEN from summarizing again.

4. **TOPIC LOCK** - If topic is locked to "${state.topic_lock}", stay on it. Briefly answer unrelated questions, then redirect back.

5. **STEP PROGRESSION** - Follow the exact step order. Do NOT skip or repeat steps.

6. **BRIEF RESPONSES** - Short, direct, professional. No long paragraphs. No repeated phrasing.

${instruction.should_confirm ? `
## ⚡ CONFIRMATION FORMAT (ONLY ONCE)

Provide ONE structured summary:
- Item/service: [name]
- ${state.active_flow === 'booking' ? 'Date/Time' : 'Quantity'}: [details]
- Name: [customer name]
- Contact: [phone/email]

Then ask: "Should I proceed?"

After this, set confirmation as sent. Do NOT repeat.
` : ''}

${instruction.should_close ? `
## 🏁 CLOSING

Task complete. Thank the user and ask if they need anything else. Do NOT re-summarize the ${state.active_flow}.
` : ''}

## 🧠 CORE IDENTITY

You are:
- A state-controlled execution agent
- Whose goal is to complete tasks efficiently
- Without loops, repetition, or forgetting

Your intelligence is measured by asking ONLY what is needed.
`);

  return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// TOPIC LOCK REDIRECT MESSAGE
// ═══════════════════════════════════════════════════════════════════════════

export function getTopicLockRedirect(state: GovernorState): string | null {
  if (!state.topic_lock || state.active_flow === 'none') {
    return null;
  }
  
  const flowName = state.active_flow === 'booking' ? 'booking' : 'order';
  const nextStep = state.missing_fields[0] || 'confirmation';
  
  return `Let's finish your ${flowName} first. ${getRedirectQuestion(nextStep)}`;
}

function getRedirectQuestion(field: string): string {
  switch (field) {
    case 'service': return 'Which service would you like?';
    case 'product': return 'What would you like to order?';
    case 'date': return 'What date works for you?';
    case 'time': return 'What time would you prefer?';
    case 'quantity': return 'How many would you like?';
    case 'name': return 'May I have your name?';
    case 'contact': return 'And the best way to reach you?';
    case 'confirmation': return 'Shall I confirm this for you?';
    default: return 'Let me help you complete this.';
  }
}
