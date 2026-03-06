// ═══════════════════════════════════════════════════════════════════════════
// LAYER 3: MEMORY & CONTEXT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

import { extractValidatedName } from '../nameValidator.ts';

export interface ConversationContext {
  serviceMentioned: string | null;
  dateMentioned: string | null;
  timeMentioned: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  currentTopic: string | null;
  pendingAction: string | null;
  emotionalState: 'neutral' | 'positive' | 'negative' | 'urgent' | 'frustrated';
  urgencyLevel: 'low' | 'normal' | 'high' | 'critical';
  conversationPhase: 'greeting' | 'discovery' | 'booking' | 'confirmation' | 'followup' | 'closing';
  correctionsMade: string[];
  topicsDiscussed: string[];
  messageCount: number;
  lastBotResponse: string | null;
}

export function createEmptyContext(): ConversationContext {
  return {
    serviceMentioned: null,
    dateMentioned: null,
    timeMentioned: null,
    customerName: null,
    customerPhone: null,
    customerEmail: null,
    currentTopic: null,
    pendingAction: null,
    emotionalState: 'neutral',
    urgencyLevel: 'normal',
    conversationPhase: 'greeting',
    correctionsMade: [],
    topicsDiscussed: [],
    messageCount: 0,
    lastBotResponse: null,
  };
}

export function extractContextFromHistory(history: any[]): ConversationContext {
  const context = createEmptyContext();
  context.messageCount = history.length;
  
  // Determine conversation phase based on history length
  if (history.length === 0) {
    context.conversationPhase = 'greeting';
  } else if (history.length <= 2) {
    context.conversationPhase = 'discovery';
  } else {
    context.conversationPhase = 'followup';
  }
  
  // Extract entities from all messages
  for (const msg of history) {
    const text = msg.message || '';
    
    // Extract service mentions
    const serviceMatch = text.match(/(?:book|schedule|want|need)\s+(?:a|an)?\s*([a-zA-Z\s]+?)(?:\s+appointment|\s+session|$)/i);
    if (serviceMatch) {
      context.serviceMentioned = serviceMatch[1].trim();
      context.conversationPhase = 'booking';
    }
    
    // Extract date mentions
    const dateMatch = text.match(/(?:on\s+)?(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i) ||
                     text.match(/(?:on\s+)?(\d{1,2}(?:st|nd|rd|th)?(?:\s+of)?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december))/i) ||
                     text.match(/(tomorrow|today|next week)/i);
    if (dateMatch) {
      context.dateMentioned = dateMatch[1] || dateMatch[0];
    }
    
    // Extract time mentions
    const timeMatch = text.match(/(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?)/i) ||
                     text.match(/(morning|afternoon|evening)/i);
    if (timeMatch) {
      context.timeMentioned = timeMatch[1] || timeMatch[0];
    }
    
    // Extract name — uses centralized validator
    // Scan each user message individually so end-of-string patterns work
    if (msg.sender !== 'bot') {
      const validatedName = extractValidatedName(text);
      if (validatedName) {
        context.customerName = validatedName;
      }
    }
    
    // Extract phone
    const phoneMatch = text.match(/(?:phone|number|call me at|reach me at)\s*([\d\s\-+()]{7,20})/i) ||
                      text.match(/([\d\s\-+()]{10,20})/);
    if (phoneMatch) {
      context.customerPhone = phoneMatch[1].trim();
    }
    
    // Extract email
    const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    if (emailMatch) {
      context.customerEmail = emailMatch[1];
    }
    
    // Detect emotional state
    if (/frustrated|angry|upset|annoyed|terrible|awful/i.test(text)) {
      context.emotionalState = 'frustrated';
    } else if (/urgent|emergency|asap|immediately|right now/i.test(text)) {
      context.emotionalState = 'urgent';
      context.urgencyLevel = 'high';
    } else if (/thank|great|awesome|wonderful|appreciate/i.test(text)) {
      context.emotionalState = 'positive';
    }
    
    // Track last bot response
    if (msg.sender === 'bot') {
      context.lastBotResponse = text;
    }
  }
  
  // If we have booking info, update phase
  if (context.serviceMentioned && context.dateMentioned && context.timeMentioned) {
    context.conversationPhase = 'confirmation';
  }
  
  return context;
}

export function buildContextSummary(context: ConversationContext): string {
  const parts: string[] = [];
  
  if (context.serviceMentioned) {
    parts.push(`Service: ${context.serviceMentioned}`);
  }
  if (context.dateMentioned) {
    parts.push(`Date: ${context.dateMentioned}`);
  }
  if (context.timeMentioned) {
    parts.push(`Time: ${context.timeMentioned}`);
  }
  if (context.customerName) {
    parts.push(`Customer: ${context.customerName}`);
  }
  if (context.customerPhone) {
    parts.push(`Phone: ${context.customerPhone}`);
  }
  if (context.customerEmail) {
    parts.push(`Email: ${context.customerEmail}`);
  }
  
  if (parts.length === 0) {
    return 'No specific booking details collected yet.';
  }
  
  return `Collected information: ${parts.join(', ')}`;
}
