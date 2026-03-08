// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED ENGINE v2 - INTENT DETECTION
// ═══════════════════════════════════════════════════════════════════════════
// 
// SINGLE intent detector. No other file should classify intents.
// Priority-based detection with context awareness.
// ═══════════════════════════════════════════════════════════════════════════

import type { 
  UserIntent, 
  IntentResult, 
  TaskType, 
  EngineState,
  BusinessCapabilities 
} from './types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// PATTERN DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

const PATTERNS = {
  // P1: Cancel/Exit (highest priority)
  cancel: /^(cancel|stop|never\s*mind|forget\s*it|start\s*over|quit|exit|new\s*question|something\s*else|abort)[\s!.,]*$/i,
  
  // P2: Greeting (only valid at start)
  greeting: /^(hi|hello|hey|good\s*(morning|afternoon|evening)|yo|sup)[\s!.,]*$/i,
  
  // P3: Farewell
  farewell: /^(bye|goodbye|thanks?\s*bye|see\s*you|take\s*care|that'?s\s*all|no\s*thanks?|nothing\s*else|i'?m\s*good|all\s*set|done)[\s!.,]*$/i,
  
  // P4: Confirmation
  confirm: /^(yes|yep|yeah|yea|correct|right|exactly|confirmed?|that'?s\s*right|perfect|great|sure|ok|okay|sounds\s*good|do\s*it|proceed|go\s*ahead|book\s*it|place\s*(the\s*)?order)[\s!.,]*$/i,
  
  // P5: Denial
  deny: /^(no|nope|nah|not\s*really|that'?s\s*wrong|incorrect|wrong|wait|hold\s*on)[\s!.,]*$/i,
  
  // P6: Acknowledgment (filler)
  ack: /^(okay|ok|kk|k|sure|alright|got\s*it|cool|fine|understood|i\s*see|mhm|uh\s*huh|right|roger)[\s!.,]*$/i,
  
  // P7: Correction
  correction: /actually|i\s*meant|i\s*said\s*.+\s*not|correction|change\s*that\s*to|switch\s*(it|that)\s*to|no\s*i\s*(meant|said)/i,
  
  // P8: Booking — EXPANDED natural language triggers
  book: /book|appointment|schedule|reserve|sign\s*(me\s*)?up|make\s*a\s*booking|set\s*up\s*an?\s*(appointment|session)|when\s*can\s*(i|we)\s*(come\s*in|visit|stop\s*by|see\s*you|swing\s*by|drop\s*by)|do\s*you\s*have\s*(any\s*)?(availability|time|opening|slot|free\s*time)|can\s*(i|you)\s*.*(fit\s*me\s*in|squeeze\s*me\s*in|see\s*me|take\s*me)|is\s*there\s*(a\s*|an\s*)?(slot|time|opening|spot)\s*(available|free|open)|what\s*(days?|times?)\s*(are|do)\s*(you|the)\s*.*(available|open|free)|i('d|\s*would)\s*like\s*to\s*(come\s*in|visit|set\s*up|arrange|plan)/i,
  
  // P9: Ordering — EXPANDED natural language triggers
  order: /buy|purchase|order|get|want\s*(to\s*)?get|i'?d\s*like|add\s*to\s*cart|checkout|shop|i\s*want|i\s*need|show\s*me\s*.*(product|item|menu|catalog)|can\s*i\s*(see|browse|look\s*at|check\s*out)\s*.*(product|item|menu|catalog|stock)|what('?s|\s*is)\s*(available|in\s*stock|on\s*the\s*menu|for\s*sale)|do\s*you\s*(sell|carry|stock|have|offer)\s|looking\s*(to|for)\s*.*(buy|purchase|order|pick\s*up|grab)|place\s*.*(order|purchase)|what\s*can\s*i\s*(buy|order|get)|what\s*(do\s*you|products?|items?)\s*.*(sell|have|offer|carry|stock)|pick\s*up|grab\s*(some|a|the)/i,
  
  // P10: Escalation
  escalate: /speak\s*to|talk\s*to|human|manager|real\s*person|live\s*agent|representative|supervisor/i,
  
  // P11: Complaint
  complaint: /complain|unhappy|upset|angry|terrible|awful|worst|frustrated|problem|issue|disappointed|unacceptable/i,
  
  // P12: Price inquiry
  price: /price|cost|how\s*much|fee|rate|charge|expensive|cheap|afford/i,
  
  // P13: Hours inquiry
  hours: /hour|open|close|when|available|timing|schedule|operation/i,
  
  // P14: Info request — EXPANDED for service discovery
  info: /what|where|which|tell\s*me|info|about|explain|describe|details?|what\s*(do\s*you|services?|can\s*you)\s*.*(do|offer|provide|help|specialize)|what\s*are\s*(my|your|the)\s*(options|services|treatments|solutions)|what\s*(would|could|might)\s*(help|work|be\s*good)\s*for|can\s*you\s*(help\s*me\s*with|assist\s*with)|what\s*kind\s*of\s*(stuff|things|work)\s*do\s*you\s*do/i,
  
  // P15: Small talk
  small_talk: /how\s*are\s*you|what'?s\s*up|how'?s\s*it\s*going|nice\s*to\s*meet|how\s*do\s*you\s*do/i,
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DETECTION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function detectIntent(
  message: string,
  state: EngineState | null,
  capabilities: BusinessCapabilities,
  isFirstMessage: boolean
): IntentResult {
  const msg = message.trim().toLowerCase();
  const hasActiveTask = state?.task_type !== null && state?.task_type !== undefined;
  
  // P1: Cancel - always highest priority
  if (PATTERNS.cancel.test(msg)) {
    return {
      intent: 'cancel',
      confidence: 0.95,
      should_start_task: false,
      target_task: null,
      should_cancel_task: true,
    };
  }
  
  // P2: Greeting - only valid at start with no task
  if (isFirstMessage && !hasActiveTask && PATTERNS.greeting.test(msg)) {
    return {
      intent: 'greeting',
      confidence: 0.9,
      should_start_task: false,
      target_task: null,
      should_cancel_task: false,
    };
  }
  
  // P3: Farewell
  if (PATTERNS.farewell.test(msg)) {
    return {
      intent: 'farewell',
      confidence: 0.9,
      should_start_task: false,
      target_task: null,
      should_cancel_task: false,
    };
  }
  
  // P4: Confirmation
  if (PATTERNS.confirm.test(msg)) {
    return {
      intent: 'confirm',
      confidence: 0.9,
      should_start_task: false,
      target_task: null,
      should_cancel_task: false,
    };
  }
  
  // P5: Denial
  if (PATTERNS.deny.test(msg)) {
    return {
      intent: 'deny',
      confidence: 0.9,
      should_start_task: false,
      target_task: null,
      should_cancel_task: false,
    };
  }
  
  // P6: Acknowledgment
  if (PATTERNS.ack.test(msg)) {
    return {
      intent: 'ack',
      confidence: 0.85,
      should_start_task: false,
      target_task: null,
      should_cancel_task: false,
    };
  }
  
  // P7: Correction
  if (PATTERNS.correction.test(msg)) {
    return {
      intent: 'correction',
      confidence: 0.85,
      should_start_task: false,
      target_task: null,
      should_cancel_task: false,
    };
  }
  
  // P8: Booking
  if (capabilities.can_book && PATTERNS.book.test(msg)) {
    const alreadyInBooking = state?.task_type === 'booking';
    return {
      intent: 'book',
      confidence: 0.9,
      should_start_task: !alreadyInBooking,
      target_task: 'booking',
      should_cancel_task: false,
    };
  }
  
  // P9: Ordering (but not if it mentions booking keywords)
  if (capabilities.can_order && PATTERNS.order.test(msg) && !PATTERNS.book.test(msg)) {
    const alreadyInOrdering = state?.task_type === 'ordering';
    return {
      intent: 'order',
      confidence: 0.9,
      should_start_task: !alreadyInOrdering,
      target_task: 'ordering',
      should_cancel_task: false,
    };
  }
  
  // P10: Escalation
  if (PATTERNS.escalate.test(msg)) {
    return {
      intent: 'escalate',
      confidence: 0.85,
      should_start_task: false,
      target_task: null,
      should_cancel_task: false,
    };
  }
  
  // P11: Complaint
  if (PATTERNS.complaint.test(msg)) {
    return {
      intent: 'complaint',
      confidence: 0.85,
      should_start_task: false,
      target_task: null,
      should_cancel_task: false,
    };
  }
  
  // P12: Price
  if (PATTERNS.price.test(msg)) {
    return {
      intent: 'price',
      confidence: 0.75,
      should_start_task: false,
      target_task: null,
      should_cancel_task: false,
    };
  }
  
  // P13: Hours
  if (PATTERNS.hours.test(msg)) {
    return {
      intent: 'hours',
      confidence: 0.75,
      should_start_task: false,
      target_task: null,
      should_cancel_task: false,
    };
  }
  
  // P14: Info
  if (PATTERNS.info.test(msg)) {
    return {
      intent: 'info',
      confidence: 0.7,
      should_start_task: false,
      target_task: null,
      should_cancel_task: false,
    };
  }
  
  // P15: Small talk
  if (PATTERNS.small_talk.test(msg)) {
    return {
      intent: 'small_talk',
      confidence: 0.6,
      should_start_task: false,
      target_task: null,
      should_cancel_task: false,
    };
  }
  
  // Default: Continue current flow or general
  return {
    intent: hasActiveTask ? 'continue' : 'info',
    confidence: 0.5,
    should_start_task: false,
    target_task: null,
    should_cancel_task: false,
  };
}
