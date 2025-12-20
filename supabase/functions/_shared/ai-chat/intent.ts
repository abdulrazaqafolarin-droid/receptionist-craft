// ═══════════════════════════════════════════════════════════════════════════
// INTENT RECOGNITION & MESSAGE ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

export type IntentType = 
  | 'book_appointment' | 'cancel_appointment' | 'reschedule'
  | 'ask_info' | 'ask_price' | 'ask_hours' | 'ask_location'
  | 'complaint' | 'compliment' | 'small_talk'
  | 'confirm' | 'deny' | 'correct_previous_info'
  | 'follow_up' | 'acknowledgment' | 'greeting' | 'farewell'
  | 'escalation_request' | 'general_query';

export type DialogAct = 
  | 'Answer' | 'AskClarity' | 'Confirm' | 'OfferOptions'
  | 'Apologize' | 'Acknowledge' | 'Escalate' | 'Summarize'
  | 'Greet' | 'Farewell' | 'Inform' | 'Request' | 'Repair';

const ACKNOWLEDGMENT_WORDS = [
  'okay', 'ok', 'kk', 'k', 'yes', 'yep', 'yeah', 'sure', 'alright', 
  'got it', 'cool', 'fine', 'good', 'great', 'perfect', 'understood', 
  'i see', 'uh huh', 'mhm', 'right', 'sounds good', 'that works'
];

const CONTEXT_DEPENDENT_PATTERNS = [
  /that one/i, /this one/i, /the same/i, /like before/i,
  /as i (said|mentioned)/i, /earlier/i, /you said/i,
];

export interface MessageAnalysis {
  isAcknowledgment: boolean;
  isCorrection: boolean;
  hasUncertainty: boolean;
  hasPronounAmbiguity: boolean;
  hasNumericQuery: boolean;
  requiresMemoryUpdate: boolean;
  detectedIntent: IntentType;
  isFollowUp: boolean;
  wordCount: number;
}

export function detectIntent(message: string, historyLength: number): IntentType {
  const lowerMsg = message.toLowerCase().trim();
  
  // Greeting detection (only valid for first message)
  if (historyLength === 0 && /^(hi|hello|hey|good (morning|afternoon|evening))/i.test(lowerMsg)) {
    return 'greeting';
  }
  
  // Farewell detection
  if (/^(bye|goodbye|thanks? bye|see you|take care)/i.test(lowerMsg)) {
    return 'farewell';
  }
  
  // Acknowledgments (short confirmations)
  if (ACKNOWLEDGMENT_WORDS.some(ack => lowerMsg === ack || lowerMsg === ack + '.' || lowerMsg === ack + '!')) {
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

export function analyzeMessage(message: string, historyLength: number): MessageAnalysis {
  const lowerMsg = message.toLowerCase().trim();
  const words = lowerMsg.split(/\s+/);
  
  const isAcknowledgment = ACKNOWLEDGMENT_WORDS.some(ack => 
    lowerMsg === ack || lowerMsg === ack + '.' || lowerMsg === ack + '!'
  );
  
  const isCorrection = /actually|i meant|i said .+ not|correction|change that/i.test(message);
  const hasUncertainty = /maybe|i think|not sure|possibly|might be|could be/i.test(lowerMsg);
  
  const pronouns = ['it', 'that', 'this', 'they', 'them', 'those', 'these', 'he', 'she'];
  const hasPronounAmbiguity = words.length <= 5 && words.some(w => pronouns.includes(w));
  
  const hasNumericQuery = /is (\d+\.?\d*) (greater|less|more|bigger|smaller) than (\d+\.?\d*)/i.test(message);
  const requiresMemoryUpdate = isCorrection || message.includes('actually') || message.includes('change that');
  
  const isFollowUp = CONTEXT_DEPENDENT_PATTERNS.some(p => p.test(lowerMsg));
  
  const detectedIntent = detectIntent(message, historyLength);
  
  return {
    isAcknowledgment,
    isCorrection,
    hasUncertainty,
    hasPronounAmbiguity,
    hasNumericQuery,
    requiresMemoryUpdate,
    detectedIntent,
    isFollowUp,
    wordCount: words.length,
  };
}

export function determineDialogAct(
  intent: IntentType,
  hasKnowledge: boolean,
  hasPendingAction: boolean
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
      return hasPendingAction ? 'Confirm' : 'AskClarity';
    default:
      return hasKnowledge ? 'Inform' : 'AskClarity';
  }
}
