// ═══════════════════════════════════════════════════════════════════════════
// LAYER 7: FAILURE PREVENTION & ESCALATION
// ═══════════════════════════════════════════════════════════════════════════
// This layer handles failure mode detection, escalation logic, and
// self-healing mechanisms to maintain conversation quality.
// ═══════════════════════════════════════════════════════════════════════════

import type { ConversationContext, ChatMessage } from './layer3-memory.ts';
import type { MessageAnalysis } from './layer4-intent.ts';

/**
 * Escalation decision result
 */
export interface EscalationDecision {
  shouldEscalate: boolean;
  reason: string | null;
  escalationType: 'confusion' | 'frustration' | 'sensitive' | 'complex' | 'user_request' | 'safety' | null;
  escalationMessage: string | null;
}

/**
 * Uncertainty check result
 */
export interface UncertaintyCheck {
  isUncertain: boolean;
  confidenceLevel: 'high' | 'medium' | 'low';
  reason?: string;
  safeResponse?: string;
}

/**
 * Factual query patterns that require verified data
 */
const FACTUAL_QUERY_PATTERNS = [
  /how much (does|is|are|do)/i,
  /what (is|are) (your|the) (price|cost|fee|rate)/i,
  /when (are|is) (you|the business|it) (open|closed)/i,
  /where (are|is) (you|the|it) located/i,
  /what (services|treatments|options)/i,
];

/**
 * Questions that cannot be answered
 */
const UNANSWERABLE_PATTERNS = [
  /will (i|it|this) .+ in the future/i,
  /predict|forecast|guarantee/i,
  /should i (invest|buy|sell)/i,
  /medical advice|diagnosis|treatment/i,
];

/**
 * Check if message requires factual data and if we have it
 */
export function checkUncertainty(
  message: string,
  knowledgeBase: string,
  intent: string
): UncertaintyCheck {
  const lowerMsg = message.toLowerCase();

  // Check if question requires factual data
  const needsFactualData = FACTUAL_QUERY_PATTERNS.some(p => p.test(message));

  if (needsFactualData) {
    const hasRelevantKnowledge =
      (intent === 'ask_price' && /\$|\d+/.test(knowledgeBase)) ||
      (intent === 'ask_hours' && /(open|close|hour|am|pm)/i.test(knowledgeBase)) ||
      (intent === 'ask_location' && /(address|located|street|road)/i.test(knowledgeBase));

    if (!hasRelevantKnowledge) {
      return {
        isUncertain: true,
        confidenceLevel: 'low',
        reason: 'Required factual data not in knowledge base',
        safeResponse: "I don't have that specific information right now. Would you like me to check or connect you with someone who can help?",
      };
    }
  }

  // Check for unanswerable questions
  for (const pattern of UNANSWERABLE_PATTERNS) {
    if (pattern.test(lowerMsg)) {
      return {
        isUncertain: true,
        confidenceLevel: 'low',
        reason: 'Question requires prediction or professional advice',
        safeResponse: "I'm not able to provide that kind of advice. I'd recommend consulting with a qualified professional.",
      };
    }
  }

  return { isUncertain: false, confidenceLevel: 'high' };
}

/**
 * Check if escalation is needed based on context and history
 */
export function checkEscalationNeeded(
  message: string,
  context: ConversationContext,
  history: ChatMessage[]
): EscalationDecision {
  const lowerMsg = message.toLowerCase();

  // User explicitly requests human
  if (/speak to (a |someone|human|person|manager)|talk to someone|real person|human help|live agent/i.test(lowerMsg)) {
    return {
      shouldEscalate: true,
      reason: 'User explicitly requested human',
      escalationType: 'user_request',
      escalationMessage: "I'd be happy to connect you with a staff member right away. Let me transfer you now.",
    };
  }

  // User frustration detected
  if (context.emotionalState === 'frustrated' && history.length > 4) {
    const recentUserMessages = history.slice(-4)
      .filter(h => h.sender === 'user')
      .map(h => h.message.toLowerCase());
    
    const frustrationIndicators = recentUserMessages.filter(m =>
      /frustrated|angry|upset|terrible|awful|worst|useless|not helping/i.test(m)
    ).length;

    if (frustrationIndicators >= 2) {
      return {
        shouldEscalate: true,
        reason: 'User frustration escalating',
        escalationType: 'frustration',
        escalationMessage: "I can see this is frustrating — I want to make sure you get the help you need. Would you like me to connect you with a staff member?",
      };
    }
  }

  // Stuck in loop (same question asked multiple times)
  if (history.length >= 6) {
    const recentUserMessages = history.slice(-6)
      .filter(h => h.sender === 'user')
      .map(h => h.message.toLowerCase().trim());
    
    const uniqueMessages = new Set(recentUserMessages);
    if (uniqueMessages.size < recentUserMessages.length / 2) {
      return {
        shouldEscalate: true,
        reason: 'Conversation stuck in loop',
        escalationType: 'confusion',
        escalationMessage: "It seems like we might be going in circles. Let me connect you with someone who can help directly.",
      };
    }
  }

  return {
    shouldEscalate: false,
    reason: null,
    escalationType: null,
    escalationMessage: null,
  };
}

/**
 * Response quality validation
 */
export interface QualityValidation {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
}

/**
 * Validate proposed response quality before sending
 */
export function validateResponseQuality(
  proposedResponse: string,
  analysis: MessageAnalysis,
  context: ConversationContext
): QualityValidation {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const lowerResponse = proposedResponse.toLowerCase();

  // Check for robotic phrases
  const roboticPhrases = ['acknowledged', 'affirmative', 'negative', 'noted', 'as an ai'];
  for (const phrase of roboticPhrases) {
    if (lowerResponse.includes(phrase)) {
      issues.push(`Contains robotic phrase: "${phrase}"`);
      suggestions.push('Use more natural language');
    }
  }

  // Check response length appropriateness
  const wordCount = proposedResponse.split(/\s+/).length;
  if (analysis.isAcknowledgment && wordCount > 25) {
    issues.push('Response too long for acknowledgment');
    suggestions.push('Keep acknowledgment responses brief (1-2 sentences)');
  }

  // Check for unnecessary greetings in follow-up
  if (context.conversationPhase !== 'greeting' && /^(hello|hi|hey|welcome)/i.test(proposedResponse)) {
    issues.push('Contains greeting in non-greeting phase');
    suggestions.push('Remove greeting, continue conversation naturally');
  }

  // Check for repetition
  const sentences = proposedResponse.split(/[.!?]+/).filter(s => s.trim());
  const uniqueSentences = new Set(sentences.map(s => s.toLowerCase().trim()));
  if (sentences.length > uniqueSentences.size) {
    issues.push('Contains repeated content');
    suggestions.push('Vary language and avoid repetition');
  }

  return {
    isValid: issues.length === 0,
    issues,
    suggestions,
  };
}

/**
 * Build the failure prevention prompt block
 */
export function buildFailurePreventionPrompt(): string {
  return `# 📌 FAILURE PREVENTION & ESCALATION

## High-Risk Failure Patterns (MUST AVOID)

### ❌ Hallucinations (Invented Facts)
NEVER guess. NEVER invent. NEVER fabricate details.
If unsure → say: "I'm not fully sure — let me double-check."

### ❌ Context Dropping (CRITICAL)
NEVER respond to "okay", "yes", "got it" with "Hello! How can I help you?"
Short replies are contextual continuations, NOT new queries.

### ❌ Repetition and Looping
Vary your language. Never say the same phrase twice in a row.

### ❌ Re-greeting (CRITICAL FAILURE)
NEVER greet after the first message.
NEVER say "Hello" or "Welcome" in follow-up messages.
This is a HARD rule with ZERO exceptions.

### ❌ Tone Mismatch
Match user's tone dynamically.
If user is casual → be conversational.
If user is frustrated → be empathetic.

## 🔍 AMBIGUITY & CLARIFICATION PROTOCOL (MANDATORY)

When a customer's message could mean two or more different things, or the intent is genuinely unclear:

### RULE 1: Never guess and proceed
If a message is ambiguous, DO NOT assume an intent and act on it. Instead, ask ONE short, polite clarifying question.

### RULE 2: Make it natural and context-aware
Frame your clarifying question using your knowledge of THIS specific business and the CURRENT conversation context. 
- ❌ BAD: "Could you please clarify your request?"
- ✅ GOOD: "Were you looking to book a haircut, or just checking our prices?"
- ✅ GOOD: "Did you mean you'd like to order that, or were you asking about availability?"

### RULE 3: ONE question at a time
Never ask more than one clarifying question in a single message. Pick the most important ambiguity and ask about that.

### RULE 4: No clarification loops (CRITICAL)
If you already asked a clarifying question and the customer's follow-up answer is STILL unclear:
- Make a reasonable assumption based on context
- State it out loud
- Proceed with it
- Offer an easy way to correct
Example: "I'll take that as a yes and go ahead with the booking — just let me know if you meant something different!"

### RULE 5: When NOT to clarify
Do NOT ask for clarification when:
- The message clearly matches a single intent (even if worded unusually)
- You're mid-flow and the message is a direct answer to your question
- The ambiguity doesn't affect your next action (e.g., a casual remark during an active task)

## Escalation Triggers
Escalate when:
- User explicitly requests a human
- User shows repeated frustration (2+ frustrated messages)
- Conversation is stuck in a loop
- Question requires professional advice
- Safety concerns arise

## Self-Healing Rules
When you detect internal failure patterns:
✔ Reset tone
✔ Re-check the last user message
✔ Ask ONE clarifying question (following the Clarification Protocol above)
✔ Do NOT continue the mistake`;
}
