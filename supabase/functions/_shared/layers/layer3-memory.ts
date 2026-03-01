// ═══════════════════════════════════════════════════════════════════════════
// LAYER 3: MEMORY & CONTEXT ENGINE
// ═══════════════════════════════════════════════════════════════════════════
// This layer handles session memory, context extraction, and conversation
// state management. It ensures the AI never forgets or repeats greetings.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Conversation context extracted from message history
 */
export interface ConversationContext {
  // Booking-related
  serviceMentioned: string | null;
  dateMentioned: string | null;
  timeMentioned: string | null;
  
  // Customer info
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  
  // Conversation state
  currentTopic: string | null;
  pendingAction: string | null;
  emotionalState: 'neutral' | 'positive' | 'negative' | 'urgent' | 'frustrated';
  urgencyLevel: 'low' | 'normal' | 'high' | 'critical';
  conversationPhase: 'greeting' | 'discovery' | 'booking' | 'confirmation' | 'followup' | 'closing';
  
  // History tracking
  correctionsMade: string[];
  topicsDiscussed: string[];
}

export interface ChatMessage {
  sender: string;
  message: string;
  metadata?: Record<string, any>;
  created_at?: string;
}

/**
 * Create an empty context for new conversations
 */
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
  };
}

/**
 * Extract structured context from conversation history
 */
export function extractContextFromHistory(history: ChatMessage[]): ConversationContext {
  const context = createEmptyContext();
  
  if (history.length === 0) {
    return context;
  }
  
  context.conversationPhase = 'discovery';
  const fullText = history.map(h => h.message).join(' ');

  // Extract service
  const serviceMatch = fullText.match(
    /(?:need|want|book|schedule|appointment for|interested in)\s+(?:a\s+)?([a-z\s]+?)(?:\s+on|\s+at|\s+for|\.|\?|$)/i
  );
  if (serviceMatch) context.serviceMentioned = serviceMatch[1].trim();

  // Extract date
  const dateMatch = fullText.match(
    /(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|next week|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i
  );
  if (dateMatch) context.dateMentioned = dateMatch[0];

  // Extract time
  const timeMatch = fullText.match(
    /(\d{1,2}:\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm)|morning|afternoon|evening)/i
  );
  if (timeMatch) context.timeMentioned = timeMatch[0];

  // Extract name
  const nameMatch = fullText.match(
    /(?:my name is|i'm|i am|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/
  );
  if (nameMatch) context.customerName = nameMatch[1];

  // Extract phone
  const phoneMatch = fullText.match(
    /(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/
  );
  if (phoneMatch) context.customerPhone = phoneMatch[1];

  // Extract email
  const emailMatch = fullText.match(
    /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
  );
  if (emailMatch) context.customerEmail = emailMatch[1];

  // Detect emotional state from last few messages
  const recentMessages = history.slice(-3).map(h => h.message.toLowerCase()).join(' ');
  if (/frustrated|angry|upset|terrible|awful|hate|worst/i.test(recentMessages)) {
    context.emotionalState = 'frustrated';
  } else if (/pain|hurt|emergency|urgent|asap|immediately|severe|bleeding/i.test(recentMessages)) {
    context.emotionalState = 'urgent';
    context.urgencyLevel = 'critical';
  } else if (/thanks|thank you|great|perfect|awesome|wonderful|happy/i.test(recentMessages)) {
    context.emotionalState = 'positive';
  } else if (/worried|anxious|concerned|nervous/i.test(recentMessages)) {
    context.emotionalState = 'negative';
  }

  // Detect conversation phase
  if (context.serviceMentioned && context.dateMentioned && context.timeMentioned) {
    context.conversationPhase = context.customerName ? 'confirmation' : 'booking';
  } else if (context.serviceMentioned || context.dateMentioned) {
    context.conversationPhase = 'booking';
  }

  return context;
}

/**
 * Generate a conversation summary for context injection
 */
export function summarizeConversation(history: ChatMessage[]): string {
  if (history.length === 0) {
    return "This is the start of a new conversation.";
  }

  const context = extractContextFromHistory(history);
  const parts: string[] = [];

  if (context.customerName) parts.push(`Customer name: ${context.customerName}`);
  if (context.serviceMentioned) parts.push(`Service discussed: ${context.serviceMentioned}`);
  if (context.dateMentioned) parts.push(`Date mentioned: ${context.dateMentioned}`);
  if (context.timeMentioned) parts.push(`Time mentioned: ${context.timeMentioned}`);
  if (context.customerPhone) parts.push(`Phone: ${context.customerPhone}`);
  if (context.customerEmail) parts.push(`Email: ${context.customerEmail}`);
  if (context.emotionalState !== 'neutral') parts.push(`Customer mood: ${context.emotionalState}`);
  
  parts.push(`Conversation phase: ${context.conversationPhase}`);
  parts.push(`Message count: ${history.length}`);

  return parts.length > 0 ? parts.join('\n') : "Conversation in progress.";
}

/**
 * Generate a rolling summary for long conversations (keeps last N messages verbatim)
 * This is the new summarization memory system
 */
export function generateRollingSummary(
  history: ChatMessage[],
  verbatimCount: number = 30
): { summary: string; recentMessages: ChatMessage[] } {
  if (history.length <= verbatimCount) {
    return {
      summary: '',
      recentMessages: history,
    };
  }

  const olderMessages = history.slice(0, -verbatimCount);
  const recentMessages = history.slice(-verbatimCount);
  
  // Build summary of older messages
  const context = extractContextFromHistory(olderMessages);
  const summaryParts: string[] = [];
  
  summaryParts.push(`[CONVERSATION SUMMARY - ${olderMessages.length} earlier messages]`);
  if (context.customerName) summaryParts.push(`Customer: ${context.customerName}`);
  if (context.serviceMentioned) summaryParts.push(`Service requested: ${context.serviceMentioned}`);
  if (context.dateMentioned) summaryParts.push(`Date preference: ${context.dateMentioned}`);
  if (context.timeMentioned) summaryParts.push(`Time preference: ${context.timeMentioned}`);
  if (context.customerPhone) summaryParts.push(`Phone: ${context.customerPhone}`);
  if (context.customerEmail) summaryParts.push(`Email: ${context.customerEmail}`);
  summaryParts.push(`Phase: ${context.conversationPhase}`);
  if (context.emotionalState !== 'neutral') {
    summaryParts.push(`Mood: ${context.emotionalState}`);
  }

  return {
    summary: summaryParts.join('\n'),
    recentMessages,
  };
}

/**
 * Build the memory/context prompt block
 */
export function buildMemoryPrompt(
  context: ConversationContext,
  summary: string,
  isFirstMessage: boolean,
  greetingMessage?: string
): string {
  const emotionalGuidance: Record<string, string> = {
    neutral: 'Maintain a warm, professional tone.',
    positive: 'Match their positive energy with enthusiasm.',
    negative: 'Be extra reassuring and empathetic.',
    urgent: 'Prioritize their needs immediately with calm urgency.',
    frustrated: 'Show deep empathy, apologize if appropriate, and focus on solutions.',
  };

  return `# 📌 SESSION & MEMORY RULES (NON-NEGOTIABLE)

## Greeting Invariant (HARD RULE)
${isFirstMessage ? `
**THIS IS THE FIRST MESSAGE** - Greet the visitor warmly:
${greetingMessage || '"Hello! Welcome. I\'m here to help. What can I do for you today?"'}

- **ONLY** greet once
- **NEVER** greet again during this session
- **NEVER** restart unless user restarts
` : `
**THIS IS A FOLLOW-UP MESSAGE** - Greeting has ALREADY occurred.
- **DO NOT** say "Hello", "Hi", "Welcome", or any greeting
- **DO NOT** re-introduce yourself
- **CONTINUE** the conversation naturally from where it left off
- Reference context from earlier in the conversation

Violation of this rule is a critical failure.
`}

## Memory Rules
You MUST:
- Remember ALL previous user messages within the session
- NEVER ask users to repeat things already stated
- Use memory to maintain continuity
- Update internal context whenever new information appears
- Track: user preferences, booking details, corrections, confirmations, clarifications, and emotional cues

## Current Context Summary
${summary}

## Current Emotional Guidance
${emotionalGuidance[context.emotionalState]}`;
}
