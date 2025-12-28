// ═══════════════════════════════════════════════════════════════════════════
// LAYER 4: INTENT & DECISION ENGINE
// ═══════════════════════════════════════════════════════════════════════════
// This layer handles intent recognition, dialog act classification,
// and structured reasoning for decision-making.
// ═══════════════════════════════════════════════════════════════════════════

import type { ConversationContext, ChatMessage } from './layer3-memory.ts';

/**
 * All possible user intents
 */
export type IntentType =
  | 'book_appointment' | 'cancel_appointment' | 'reschedule'
  | 'ask_info' | 'ask_price' | 'ask_hours' | 'ask_location'
  | 'complaint' | 'compliment' | 'small_talk'
  | 'confirm' | 'deny' | 'correct_previous_info'
  | 'follow_up' | 'acknowledgment' | 'greeting' | 'farewell'
  | 'escalation_request' | 'general_query';

/**
 * Dialog acts for response classification
 */
export type DialogAct =
  | 'Answer' | 'AskClarity' | 'Confirm' | 'OfferOptions'
  | 'Apologize' | 'Acknowledge' | 'Escalate' | 'Summarize'
  | 'Greet' | 'Farewell' | 'Inform' | 'Request' | 'Repair';

/**
 * Message analysis result
 */
export interface MessageAnalysis {
  isAcknowledgment: boolean;
  isCorrection: boolean;
  hasUncertainty: boolean;
  hasPronounAmbiguity: boolean;
  hasNumericQuery: boolean;
  requiresMemoryUpdate: boolean;
  detectedIntent: string;
  wordCount: number;
}

// Patterns for message analysis
const ACKNOWLEDGMENTS = [
  'okay', 'ok', 'kk', 'k', 'yes', 'yep', 'yeah', 'sure', 'alright',
  'got it', 'cool', 'fine', 'good', 'great', 'perfect', 'understood',
  'i see', 'uh huh', 'mhm', 'right', 'sounds good', 'that works'
];

const CORRECTION_PATTERNS = [
  /i said (.+) not (.+)/i,
  /i meant (.+)/i,
  /actually it's (.+)/i,
  /no, (.+)/i,
  /correction:? (.+)/i,
];

const UNCERTAINTY_INDICATORS = ['maybe', 'i think', 'not sure', 'possibly', 'might be', 'could be'];
const PRONOUNS = ['it', 'that', 'this', 'they', 'them', 'those', 'these', 'he', 'she'];

const CONTEXT_DEPENDENT_PATTERNS = [
  /that one/i, /this one/i, /the same/i, /like before/i,
  /as i (said|mentioned)/i, /earlier/i, /you said/i,
];

/**
 * Detect user intent from message and conversation history
 */
export function detectIntent(message: string, history: ChatMessage[]): IntentType {
  const lowerMsg = message.toLowerCase().trim();

  // Greeting detection (only valid for first message)
  if (history.length === 0 && /^(hi|hello|hey|good (morning|afternoon|evening))/i.test(lowerMsg)) {
    return 'greeting';
  }

  // Farewell detection
  if (/^(bye|goodbye|thanks? bye|see you|take care)/i.test(lowerMsg)) {
    return 'farewell';
  }

  // Acknowledgments (short confirmations)
  if (ACKNOWLEDGMENTS.some(ack => lowerMsg === ack || lowerMsg === ack + '.' || lowerMsg === ack + '!')) {
    return 'acknowledgment';
  }

  // Confirmation vs Denial
  if (/^(yes|yep|yeah|correct|right|exactly|confirmed?|that's right)/i.test(lowerMsg)) {
    return 'confirm';
  }
  if (/^(no|nope|not really|that's wrong|incorrect)/i.test(lowerMsg)) {
    return 'deny';
  }

  // Corrections
  if (/actually|i meant|i said .+ not|correction|change that to|switch (it|that) to/i.test(lowerMsg)) {
    return 'correct_previous_info';
  }

  // Booking intents
  if (/book|schedule|appointment|reserve|sign (me )?up|make a booking/i.test(lowerMsg)) {
    return 'book_appointment';
  }
  if (/cancel|delete|remove|don't want/i.test(lowerMsg) && /appointment|booking/i.test(lowerMsg)) {
    return 'cancel_appointment';
  }
  if (/reschedule|change (the |my )?(date|time|appointment)|move (it|my appointment)/i.test(lowerMsg)) {
    return 'reschedule';
  }

  // Pricing
  if (/price|cost|how much|fee|rate|charge|expensive/i.test(lowerMsg)) {
    return 'ask_price';
  }

  // Hours
  if (/hour|open|close|when|available|schedule|timing/i.test(lowerMsg)) {
    return 'ask_hours';
  }

  // Location
  if (/where|location|address|direction|find you|get there/i.test(lowerMsg)) {
    return 'ask_location';
  }

  // Complaints
  if (/complain|unhappy|upset|angry|terrible|awful|worst|frustrated|problem with/i.test(lowerMsg)) {
    return 'complaint';
  }

  // Compliments
  if (/thank|thanks|great|awesome|wonderful|amazing|love it|appreciate/i.test(lowerMsg)) {
    return 'compliment';
  }

  // Escalation
  if (/speak to (a |someone|human|person|manager)|talk to someone|real person|human help/i.test(lowerMsg)) {
    return 'escalation_request';
  }

  // Small talk
  if (/how are you|what's up|how's it going|nice to meet/i.test(lowerMsg)) {
    return 'small_talk';
  }

  // Follow-up (short messages referring to context)
  if (lowerMsg.length < 20 && CONTEXT_DEPENDENT_PATTERNS.some(p => p.test(lowerMsg))) {
    return 'follow_up';
  }

  // General info request
  if (/what|which|tell me|info|information|about/i.test(lowerMsg)) {
    return 'ask_info';
  }

  return 'general_query';
}

/**
 * Analyze message for special handling requirements
 */
export function analyzeMessage(message: string, history: ChatMessage[]): MessageAnalysis {
  const lowerMsg = message.toLowerCase().trim();
  const words = lowerMsg.split(/\s+/);
  
  const isAcknowledgment = ACKNOWLEDGMENTS.some(ack =>
    lowerMsg === ack || lowerMsg === ack + '.' || lowerMsg === ack + '!'
  );
  
  const isCorrection = CORRECTION_PATTERNS.some(pattern => pattern.test(message));
  const hasUncertainty = UNCERTAINTY_INDICATORS.some(ind => lowerMsg.includes(ind));
  const hasPronounAmbiguity = words.length <= 5 && words.some(w => PRONOUNS.includes(w));
  
  const numericPatterns = [
    /is (\d+\.?\d*) (greater|less|more|bigger|smaller) than (\d+\.?\d*)/i,
    /(\d+\.?\d*) (>|<|>=|<=) (\d+\.?\d*)/i,
  ];
  const hasNumericQuery = numericPatterns.some(pattern => pattern.test(message));
  
  const requiresMemoryUpdate = isCorrection || 
    message.includes('actually') || 
    message.includes('change that');

  let detectedIntent = 'general_query';
  if (isAcknowledgment) detectedIntent = 'acknowledgment';
  else if (isCorrection) detectedIntent = 'correction';
  else if (/\?$/.test(message.trim())) detectedIntent = 'question';
  else if (/book|appointment|schedule|reserve/i.test(message)) detectedIntent = 'booking';
  else if (/cancel|reschedule|change/i.test(message)) detectedIntent = 'modification';
  else if (/price|cost|how much/i.test(message)) detectedIntent = 'pricing_inquiry';
  else if (/hour|open|close|when|available/i.test(message)) detectedIntent = 'availability_inquiry';

  return {
    isAcknowledgment,
    isCorrection,
    hasUncertainty,
    hasPronounAmbiguity,
    hasNumericQuery,
    requiresMemoryUpdate,
    detectedIntent,
    wordCount: words.length,
  };
}

/**
 * Determine appropriate dialog act based on intent and context
 */
export function determineDialogAct(
  intent: IntentType,
  context: ConversationContext,
  hasKnowledge: boolean
): DialogAct {
  switch (intent) {
    case 'greeting':
      return 'Greet';
    case 'farewell':
      return 'Farewell';
    case 'acknowledgment':
      return 'Acknowledge';
    case 'confirm':
      return 'Confirm';
    case 'correct_previous_info':
      return 'Repair';
    case 'escalation_request':
      return 'Escalate';
    case 'complaint':
      return 'Apologize';
    case 'ask_price':
    case 'ask_hours':
    case 'ask_location':
    case 'ask_info':
      return hasKnowledge ? 'Answer' : 'AskClarity';
    case 'book_appointment':
    case 'cancel_appointment':
    case 'reschedule':
      return context.pendingAction ? 'Confirm' : 'AskClarity';
    default:
      return hasKnowledge ? 'Inform' : 'AskClarity';
  }
}

/**
 * Build the intent/decision engine prompt block
 */
export function buildIntentPrompt(analysis: MessageAnalysis): string {
  let specificGuidance = '';
  
  if (analysis.isAcknowledgment) {
    specificGuidance = `
### ⚡ ACKNOWLEDGMENT HANDLING (CRITICAL)
The user sent a simple acknowledgment like "okay", "yes", "got it", etc.

**DO NOT:**
- Greet them again
- Ask "How can I help you?"
- Treat this as a new query
- Give a long response

**DO:**
- If a task was just completed → Brief confirmation ("Perfect!", "Great, all set!")
- If waiting for next step → Proceed naturally
- If no action needed → Very brief acknowledgment only
`;
  }

  if (analysis.isCorrection) {
    specificGuidance += `
### 🔄 CORRECTION HANDLING
The user is correcting previous information.

**DO:**
- Acknowledge the correction explicitly
- Update your understanding
- Apologize briefly if you misunderstood
- Continue with the corrected information
`;
  }

  if (analysis.hasPronounAmbiguity) {
    specificGuidance += `
### 🔗 PRONOUN RESOLUTION
The message contains ambiguous pronouns (it, that, this, they).

**DO:**
- Use conversation context to resolve references
- If truly ambiguous, ask: "Just to make sure I understand, are you referring to [X]?"
`;
  }

  if (analysis.hasNumericQuery) {
    specificGuidance += `
### 🔢 NUMERIC REASONING
The message involves numeric comparison.

**DO:**
- Use explicit calculation/comparison
- State the comparison clearly
- Double-check numeric logic
`;
  }

  return `# 📌 INTENT & DECISION ENGINE

## Message Analysis
- Detected Intent: ${analysis.detectedIntent.toUpperCase()}
- Word Count: ${analysis.wordCount}
- Is Acknowledgment: ${analysis.isAcknowledgment}
- Is Correction: ${analysis.isCorrection}
- Has Uncertainty: ${analysis.hasUncertainty}
- Has Pronoun Ambiguity: ${analysis.hasPronounAmbiguity}
${specificGuidance}

## Intent Recognition Rules
Detected intents include:
- book_appointment, modify_appointment, confirm_appointment, cancel_appointment, reschedule
- ask_price, ask_info, ask_hours, ask_location, ask_policy, faq_query
- complaint, appreciation, small_talk
- request_escalation, follow_up, correction, ambiguous_acknowledgment

## Dialog Act Selection
Every reply MUST be classified as:
- **Answer** → Providing information
- **AskClarity** → Requesting clarification
- **Acknowledge** → Brief confirmation
- **Confirm** → Confirming details
- **Offer Options** → Presenting choices
- **Summarize** → Recapping information
- **Apologize** → Expressing regret
- **Empathize** → Showing understanding
- **Escalate** → Connecting to human
- **Repair** → Correcting misunderstanding`;
}
