# COMPLETE AI RECEPTIONIST SYSTEM AUDIT
## Legal-Grade Technical Documentation for Expert Review

**Generated:** 2025-12-28
**Purpose:** Full system disclosure for third-party audit, hardening, and re-implementation
**Classification:** Complete Technical Extraction - No Omissions

---

# SECTION 1 — SYSTEM OVERVIEW

## 1.1 Purpose

The AI receptionist is a conversational AI system that:
- Handles customer inquiries for businesses
- Books, modifies, and cancels appointments
- Answers FAQs from a curated knowledge base
- Collects customer contact information
- Escalates to human support when needed
- Maintains conversation continuity across sessions

## 1.2 Supported User Flows

1. **Chat Flow**: General conversation with FAQ matching and AI responses
2. **Booking Flow**: Service selection → Date selection → Time selection → Contact collection → Confirmation
3. **Alternative Booking**: When requested time unavailable, offer alternatives
4. **Escalation Flow**: Transfer to human when triggered
5. **Safety Flow**: Block harmful/jailbreak attempts

## 1.3 Entry Points

| Entry Point | File | Trigger |
|------------|------|---------|
| Widget Chat | `supabase/functions/widget-chat/index.ts` | POST request from frontend widget |
| API Chat | `supabase/functions/chat/index.ts` | POST request from authenticated API |
| Book Appointment | `supabase/functions/book-appointment/index.ts` | Direct booking API call |
| Check Availability | `supabase/functions/check-availability/index.ts` | Availability check API |
| Appointment Actions | `supabase/functions/appointment-action/index.ts` | Confirm/cancel via token |

## 1.4 External Dependencies

| Dependency | Purpose | Environment Variable |
|-----------|---------|---------------------|
| Lovable AI Gateway | LLM completions | `LOVABLE_API_KEY` |
| Supabase | Database, Auth, Edge Functions | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Resend | Email notifications | `RESEND_API_KEY` |

---

# SECTION 2 — FULL 7-LAYER AI LOGIC

## Layer 1: Base Model & Architecture Configuration

**Location:** `supabase/functions/widget-chat/index.ts` lines 2784-2796

**Responsibility:** Model selection and parameter configuration

**Exact Logic:**
```typescript
model: receptionist.model || "google/gemini-2.5-flash"
temperature: 0.85  // Fixed: balanced variation
max_tokens: messageAnalysis.isAcknowledgment ? 150 : 500
```

**Inputs:**
- `receptionist.model` from database
- `messageAnalysis.isAcknowledgment` boolean

**Outputs:**
- AI completion response

**Failure Modes:**
- 429: Rate limit → Return "Service is busy" error
- 402: Payment required → Return "Service unavailable" 
- Other errors → Throw and return 500

---

## Layer 2: Retrieval/Grounding (RAG) System

**Location:** `supabase/functions/widget-chat/index.ts` lines 1167-1221

**Responsibility:** Build knowledge base from verified sources

**Function:** `buildKnowledgeBase(receptionist, faqs, services)`

**Exact Logic:**
```typescript
function buildKnowledgeBase(receptionist: any, faqs: any[], services: any[]): string {
  const sections: string[] = [];
  
  // HIGH CONFIDENCE - Business Info (direct from DB)
  sections.push(`## VERIFIED BUSINESS INFORMATION [HIGH CONFIDENCE]`);
  sections.push(`Business: ${receptionist.business_name}`);
  if (receptionist.business_type) sections.push(`Type: ${receptionist.business_type}`);
  if (receptionist.business_phone || receptionist.phone) {
    sections.push(`Phone: ${receptionist.business_phone || receptionist.phone}`);
  }
  if (receptionist.address) sections.push(`Address: ${receptionist.address}`);
  if (receptionist.website) sections.push(`Website: ${receptionist.website}`);
  if (receptionist.timezone) sections.push(`Timezone: ${receptionist.timezone}`);
  
  // HIGH CONFIDENCE - Hours
  if (receptionist.hours_of_operation) {
    sections.push(`\n## HOURS OF OPERATION [HIGH CONFIDENCE]`);
    // ... serialize hours
  }
  
  // HIGH CONFIDENCE - Services from DB
  if (services && services.length > 0) {
    sections.push(`\n## AVAILABLE SERVICES [HIGH CONFIDENCE]`);
    services.forEach((s: any) => {
      let serviceDesc = `- **${s.name}**`;
      if (s.duration_minutes) serviceDesc += ` (${s.duration_minutes} minutes)`;
      if (s.description) serviceDesc += `: ${s.description}`;
      sections.push(serviceDesc);
    });
  }
  
  // HIGH CONFIDENCE - FAQs (curated)
  if (faqs && faqs.length > 0) {
    sections.push(`\n## FREQUENTLY ASKED QUESTIONS [HIGH CONFIDENCE]`);
    faqs.forEach((f: any) => {
      sections.push(`Q: ${f.question}`);
      sections.push(`A: ${f.answer}\n`);
    });
  }
  
  // MEDIUM CONFIDENCE - Knowledge base (may be auto-generated)
  if (receptionist.knowledge_base) {
    sections.push(`\n## ADDITIONAL BUSINESS KNOWLEDGE [MEDIUM CONFIDENCE]`);
    sections.push(receptionist.knowledge_base);
  }
  
  return sections.join('\n');
}
```

**Inputs:**
- `receptionist` object from DB
- `faqs[]` from `receptionist_faqs` table
- `services[]` from `services` table

**Outputs:**
- Formatted markdown string with confidence labels

**Failure Modes:**
- Missing data → Section omitted
- No FAQs → "No FAQs provided" section

---

## Layer 3: Memory & Context Management

**Location:** 
- `supabase/functions/widget-chat/index.ts` lines 576-677
- `supabase/functions/_shared/ai-chat/context.ts` (full file)

**Responsibility:** Extract and maintain conversation context

### 3A. Context Interface

```typescript
interface ConversationContext {
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
```

### 3B. Entity Extraction Logic

```typescript
function extractContextFromHistory(history: any[]): ConversationContext {
  const context = createEmptyContext();
  context.messageCount = history.length;
  
  // Phase detection
  if (history.length === 0) {
    context.conversationPhase = 'greeting';
  } else if (history.length <= 2) {
    context.conversationPhase = 'discovery';
  } else {
    context.conversationPhase = 'followup';
  }
  
  for (const msg of history) {
    const text = msg.message || '';
    
    // Service extraction
    const serviceMatch = text.match(/(?:book|schedule|want|need)\s+(?:a|an)?\s*([a-zA-Z\s]+?)(?:\s+appointment|\s+session|$)/i);
    if (serviceMatch) {
      context.serviceMentioned = serviceMatch[1].trim();
      context.conversationPhase = 'booking';
    }
    
    // Date extraction
    const dateMatch = text.match(/(?:on\s+)?(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i) ||
                     text.match(/(?:on\s+)?(\d{1,2}(?:st|nd|rd|th)?(?:\s+of)?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december))/i) ||
                     text.match(/(tomorrow|today|next week)/i);
    if (dateMatch) {
      context.dateMentioned = dateMatch[1] || dateMatch[0];
    }
    
    // Time extraction
    const timeMatch = text.match(/(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?)/i) ||
                     text.match(/(morning|afternoon|evening)/i);
    if (timeMatch) {
      context.timeMentioned = timeMatch[1] || timeMatch[0];
    }
    
    // Name extraction
    const nameMatch = text.match(/(?:my name is|i'm|i am|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (nameMatch) {
      context.customerName = nameMatch[1];
    }
    
    // Phone extraction
    const phoneMatch = text.match(/(?:phone|number|call me at|reach me at)\s*([\d\s\-+()]{7,20})/i) ||
                      text.match(/([\d\s\-+()]{10,20})/);
    if (phoneMatch) {
      context.customerPhone = phoneMatch[1].trim();
    }
    
    // Email extraction
    const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    if (emailMatch) {
      context.customerEmail = emailMatch[1];
    }
    
    // Emotional state detection
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
  
  // Update phase based on collected info
  if (context.serviceMentioned && context.dateMentioned && context.timeMentioned) {
    context.conversationPhase = 'confirmation';
  }
  
  return context;
}
```

### 3C. Conversation Summary

```typescript
function summarizeConversation(history: any[]): string {
  if (history.length === 0) return "This is the start of a new conversation.";
  
  const context = extractContextFromHistory(history);
  const parts: string[] = [];
  
  if (context.customerName) parts.push(`Customer name: ${context.customerName}`);
  if (context.serviceMentioned) parts.push(`Service discussed: ${context.serviceMentioned}`);
  if (context.dateMentioned) parts.push(`Date mentioned: ${context.dateMentioned}`);
  if (context.timeMentioned) parts.push(`Time mentioned: ${context.timeMentioned}`);
  if (context.emotionalState !== 'neutral') parts.push(`Customer mood: ${context.emotionalState}`);
  
  parts.push(`Conversation phase: ${context.conversationPhase}`);
  parts.push(`Message count: ${history.length}`);
  
  return parts.length > 0 ? parts.join('\n') : "Conversation in progress.";
}
```

**Inputs:**
- `history[]` from `chat_messages` table (limit 50)

**Outputs:**
- `ConversationContext` object
- Summary string for prompt injection

**Failure Modes:**
- Empty history → Default "greeting" phase
- No matches → null values in context

---

## Layer 4: Safety, Red-Teaming & Monitoring

**Location:** 
- `supabase/functions/widget-chat/index.ts` lines 68-116
- `supabase/functions/_shared/ai-chat/safety.ts`

**Responsibility:** Block unsafe/malicious inputs before processing

### 4A. Safety Patterns

```typescript
const SAFETY_PATTERNS = {
  jailbreak: [
    /ignore (previous|all|your) instructions/i,
    /pretend (you are|to be|you're)/i,
    /act as if/i,
    /forget (everything|your training)/i,
    /you are now/i,
    /disregard (the|your) system/i,
    /bypass (safety|restrictions)/i,
    /roleplay as/i,
  ],
  harmful: [
    /how to (harm|hurt|kill)/i,
    /illegal (drugs|weapons)/i,
    /make (a bomb|explosives)/i,
  ],
  pii_request: [
    /give me (your|the) (password|api key|secret)/i,
    /what is (the|your) (credit card|ssn|social security)/i,
  ],
  bias_triggers: [
    /all (women|men|people of) are/i,
    /why are (asians|blacks|whites|mexicans)/i,
  ]
};
```

### 4B. Safety Classifier

```typescript
function runSafetyClassifier(message: string): SafetyResult {
  for (const pattern of SAFETY_PATTERNS.jailbreak) {
    if (pattern.test(message)) {
      return { safe: false, violation: 'jailbreak_attempt', severity: 'high' };
    }
  }
  for (const pattern of SAFETY_PATTERNS.harmful) {
    if (pattern.test(message)) {
      return { safe: false, violation: 'harmful_content', severity: 'high' };
    }
  }
  for (const pattern of SAFETY_PATTERNS.pii_request) {
    if (pattern.test(message)) {
      return { safe: false, violation: 'pii_extraction', severity: 'medium' };
    }
  }
  for (const pattern of SAFETY_PATTERNS.bias_triggers) {
    if (pattern.test(message)) {
      return { safe: false, violation: 'bias_trigger', severity: 'medium' };
    }
  }
  return { safe: true, severity: 'low' };
}
```

### 4C. Safety Response Logic

**Location:** `supabase/functions/widget-chat/index.ts` lines 2672-2712

```typescript
if (!safetyResult.safe) {
  // Log violation
  await supabase.from("chat_messages").insert({
    receptionist_id: receptionistId,
    session_id: sessionId,
    user_id: sessionId || "anonymous",
    sender: "user",
    message: message,
    metadata: { 
      safety_violation: safetyResult.violation,
      severity: safetyResult.severity,
      timestamp: new Date().toISOString() 
    }
  });

  const safetyResponse = safetyResult.severity === 'high'
    ? "I'm sorry, but I can only help with questions about our services and appointments. Is there something specific I can assist you with today?"
    : "I appreciate your question, but that's not something I'm able to help with. I'm here to assist with appointments, services, and general inquiries about our business. What can I help you with?";

  // Store and return
  await supabase.from("chat_messages").insert({...});
  return new Response(JSON.stringify({ reply: safetyResponse, hasBookingIntent: false }), {...});
}
```

**Inputs:**
- Raw user message string

**Outputs:**
- `SafetyResult` object with `safe`, `violation`, `severity`
- Redirect response if unsafe

**Failure Modes:**
- Novel attack vectors not in patterns → Passes through

---

## Layer 5: Preference Alignment (Intent & Dialog Act)

**Location:**
- `supabase/functions/widget-chat/index.ts` lines 198-338
- `supabase/functions/_shared/ai-chat/intent.ts`

**Responsibility:** Classify user intent and select appropriate response type

### 5A. Intent Types

```typescript
type IntentType = 
  | 'book_appointment' | 'cancel_appointment' | 'reschedule'
  | 'ask_info' | 'ask_price' | 'ask_hours' | 'ask_location'
  | 'complaint' | 'compliment' | 'small_talk'
  | 'confirm' | 'deny' | 'correct_previous_info'
  | 'follow_up' | 'acknowledgment' | 'greeting' | 'farewell'
  | 'escalation_request' | 'general_query';
```

### 5B. Intent Detection Logic

```typescript
function detectIntent(message: string, historyLength: number): IntentType {
  const lowerMsg = message.toLowerCase().trim();
  
  // Greeting detection (only for first message)
  if (historyLength === 0 && /^(hi|hello|hey|good (morning|afternoon|evening))/i.test(lowerMsg)) {
    return 'greeting';
  }
  
  // Farewell detection
  if (/^(bye|goodbye|thanks? bye|see you|take care)/i.test(lowerMsg)) {
    return 'farewell';
  }
  
  // Acknowledgments
  const ACKNOWLEDGMENT_WORDS = [
    'okay', 'ok', 'kk', 'k', 'yes', 'yep', 'yeah', 'sure', 'alright', 
    'got it', 'cool', 'fine', 'good', 'great', 'perfect', 'understood', 
    'i see', 'uh huh', 'mhm', 'right', 'sounds good', 'that works'
  ];
  if (ACKNOWLEDGMENT_WORDS.some(ack => lowerMsg === ack || lowerMsg === ack + '.' || lowerMsg === ack + '!')) {
    return 'acknowledgment';
  }
  
  // Confirm/Deny
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
  
  // Follow-up (short + context dependent)
  if (lowerMsg.length < 20 && CONTEXT_DEPENDENT_PATTERNS.some(p => p.test(lowerMsg))) {
    return 'follow_up';
  }
  
  // Info request
  if (/what|which|tell me|info|information|about/i.test(lowerMsg)) {
    return 'ask_info';
  }
  
  return 'general_query';
}
```

### 5C. Dialog Act Classification

```typescript
type DialogAct = 
  | 'Answer' | 'AskClarity' | 'Confirm' | 'OfferOptions'
  | 'Apologize' | 'Acknowledge' | 'Escalate' | 'Summarize'
  | 'Greet' | 'Farewell' | 'Inform' | 'Request' | 'Repair';

function determineDialogAct(intent: IntentType, hasKnowledge: boolean, hasPendingAction: boolean): DialogAct {
  switch (intent) {
    case 'greeting': return 'Greet';
    case 'farewell': return 'Farewell';
    case 'acknowledgment': return 'Acknowledge';
    case 'confirm': return 'Confirm';
    case 'correct_previous_info': return 'Repair';
    case 'escalation_request': return 'Escalate';
    case 'complaint': return 'Apologize';
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
```

### 5D. Message Analysis Output

```typescript
interface MessageAnalysis {
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
```

---

## Layer 6: Human-Centered Evaluation Metrics

**Location:** 
- `supabase/functions/widget-chat/index.ts` lines 961-1165
- `supabase/functions/_shared/ai-chat/quality-metrics.ts`

**Responsibility:** Evaluate response quality and track KPIs

### 6A. Quality Metrics Interface

```typescript
interface QualityMetrics {
  overall_quality: number;
  relevance: number;
  empathy: number;
  clarity: number;
  factuality: number;
  naturalness: number;
  passes_threshold: boolean;
  issues: string[];
}
```

### 6B. Quality Computation

```typescript
function computeQualityMetrics(
  userMessage: string,
  botReply: string,
  context: ConversationContext,
  messageAnalysis: MessageAnalysis,
  history?: any[]
): QualityMetrics {
  const issues: string[] = [];
  let totalScore = 0;
  const weights = { relevance: 0.25, empathy: 0.2, clarity: 0.2, factuality: 0.2, naturalness: 0.15 };
  
  const relevanceScore = calculateRelevance(userMessage, botReply, messageAnalysis);
  totalScore += relevanceScore * weights.relevance;
  
  const empathyScore = calculateEmpathy(botReply, context.emotionalState);
  totalScore += empathyScore * weights.empathy;
  
  const clarityScore = calculateClarity(botReply);
  totalScore += clarityScore * weights.clarity;
  
  const factualityScore = calculateFactuality(botReply, messageAnalysis);
  totalScore += factualityScore * weights.factuality;
  
  const naturalnessScore = calculateNaturalness(botReply, history);
  totalScore += naturalnessScore * weights.naturalness;
  
  return {
    overall_quality: Math.round(totalScore * 100) / 100,
    relevance: Math.round(relevanceScore * 100) / 100,
    empathy: Math.round(empathyScore * 100) / 100,
    clarity: Math.round(clarityScore * 100) / 100,
    factuality: Math.round(factualityScore * 100) / 100,
    naturalness: Math.round(naturalnessScore * 100) / 100,
    passes_threshold: totalScore >= 0.7,
    issues,
  };
}
```

### 6C. Naturalness Check (Robotic Phrase Detection)

```typescript
const ROBOTIC_PHRASES = [
  'acknowledged', 'affirmative', 'negative', 'noted',
  'as per your request', 'kindly', 'hereby', 'therein',
  'as an ai', 'i am a bot', 'i am programmed',
];

function calculateNaturalness(botReply: string, history?: any[]): number {
  let score = 1;
  const lowerReply = botReply.toLowerCase();
  
  // Penalize robotic phrases
  for (const phrase of ROBOTIC_PHRASES) {
    if (lowerReply.includes(phrase)) {
      score -= 0.2;
    }
  }
  
  // Penalize repetition
  if (history && history.length > 0) {
    const lastBotMessages = history
      .filter((m: any) => m.sender === 'bot')
      .slice(-3)
      .map((m: any) => m.message?.toLowerCase() || '');
    
    for (const prevMsg of lastBotMessages) {
      if (prevMsg && lowerReply.includes(prevMsg.slice(0, 50))) {
        score -= 0.3;
        break;
      }
    }
  }
  
  // Penalize unnecessary greetings in follow-up
  if (history && history.length > 2 && /^(hello|hi|hey|welcome)/i.test(botReply)) {
    score -= 0.3;
  }
  
  return Math.max(0.2, score);
}
```

### 6D. Conversation KPIs

```typescript
interface ConversationKPIs {
  is_engaged: boolean;
  repetition_rate: number;
  hallucination_risk: number;
  goal_completion_likely: boolean;
  user_said_thanks: boolean;
  user_expressed_frustration: boolean;
  avg_response_length: number;
  turn_count: number;
}

function computeConversationKPIs(history: any[], context: ConversationContext): ConversationKPIs {
  const botMessages = history.filter((m: any) => m.sender === 'bot');
  const userMessages = history.filter((m: any) => m.sender === 'user');
  
  // Repetition rate
  const botTexts = botMessages.map((m: any) => m.message?.toLowerCase().slice(0, 50) || '');
  const uniqueTexts = new Set(botTexts);
  const repetition_rate = botTexts.length > 0 ? 1 - (uniqueTexts.size / botTexts.length) : 0;
  
  // Frustration detection
  const user_expressed_frustration = userMessages.some((m: any) => 
    /frustrated|angry|upset|annoyed|terrible|awful|worst/i.test(m.message || '')
  );
  
  // Thanks detection
  const user_said_thanks = userMessages.some((m: any) => 
    /thank|thanks|appreciate/i.test(m.message || '')
  );
  
  // Engagement (4+ messages, low repetition)
  const is_engaged = history.length >= 4 && repetition_rate < 0.3;
  
  // Goal completion estimate
  const goal_completion_likely = 
    context.serviceMentioned !== null || 
    context.conversationPhase === 'confirmation' ||
    user_said_thanks;
  
  return {
    is_engaged,
    repetition_rate: Math.round(repetition_rate * 100) / 100,
    hallucination_risk: context.urgencyLevel === 'critical' ? 0.3 : 0.1,
    goal_completion_likely,
    user_said_thanks,
    user_expressed_frustration,
    avg_response_length: /* calculated */,
    turn_count: history.length,
  };
}
```

### 6E. Escalation Logic

```typescript
function checkEscalationNeeded(message: string, context: ConversationContext, history: any[]): EscalationCheck {
  // User explicit request
  if (/speak to (a |someone|human|person|manager)|talk to someone|real person/i.test(message)) {
    return {
      shouldEscalate: true,
      reason: 'User explicitly requested human assistance',
      escalationType: 'human_request',
    };
  }
  
  // Repeated frustration
  if (context.emotionalState === 'frustrated') {
    const frustrationCount = history.filter((m: any) => 
      m.sender === 'user' && /frustrated|angry|upset/i.test(m.message || '')
    ).length;
    
    if (frustrationCount >= 2) {
      return {
        shouldEscalate: true,
        reason: 'User expressed repeated frustration',
        escalationType: 'frustration',
      };
    }
  }
  
  // Loop detection (4+ similar messages)
  const userMessages = history.filter((m: any) => m.sender === 'user').slice(-5);
  const recentTexts = userMessages.map((m: any) => m.message?.toLowerCase().slice(0, 30) || '');
  const uniqueRecent = new Set(recentTexts);
  
  if (recentTexts.length >= 4 && uniqueRecent.size <= 2) {
    return {
      shouldEscalate: true,
      reason: 'User seems stuck in a loop',
      escalationType: 'repeated_failure',
    };
  }
  
  return { shouldEscalate: false };
}
```

---

## Layer 7: Failure Mode Prevention & Correction

**Location:** `supabase/functions/widget-chat/index.ts` lines 1987-2055

**Responsibility:** Inject message-specific guidance to prevent known failure modes

### 7A. Acknowledgment Handling

```typescript
${messageAnalysis.isAcknowledgment ? `
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
` : ''}
```

### 7B. Correction Handling

```typescript
${messageAnalysis.isCorrection ? `
### 🔄 CORRECTION HANDLING
The user is correcting previous information.

**DO:**
- Acknowledge the correction explicitly
- Update your understanding
- Apologize briefly if you misunderstood
- Continue with the corrected information
` : ''}
```

### 7C. Pronoun Resolution

```typescript
${messageAnalysis.hasPronounAmbiguity ? `
### 🔗 PRONOUN RESOLUTION
The message contains ambiguous pronouns (it, that, this, they).

**DO:**
- Use conversation context to resolve references
- If truly ambiguous, ask: "Just to make sure I understand, are you referring to [X]?"
` : ''}
```

---

# SECTION 3 — MASTER SYSTEM PROMPTS

## 3.1 Full Master System Prompt

**Location:** `supabase/functions/widget-chat/index.ts` lines 1226-2542

**Total Length:** ~2,500 lines

**Structure:**
1. Identity preamble (30 lines)
2. Section 1: Environment & Context (100 lines)
3. Section 2: Memory & Conversation State (100 lines)
4. Section 3: Intent/Entity/Dialog Engine (150 lines)
5. Section 4: Tone/Personality/Style (200 lines)
6. Section 5: Knowledge Grounding (150 lines)
7. Section 6: Reasoning/Logic/Non-hallucination (200 lines)
8. Section 7: Error/Ambiguity Handling (100 lines)
9. Section 8: Emotional Intelligence (150 lines)
10. Section 9: Safety/Ethics/Privacy (200 lines)
11. Section 10: Conversation Flow Logic (250 lines)
12. Layer 3: Advanced Conversational Intelligence (400 lines)
13. Layer 5: S-Tier Failure Prevention (500 lines)
14. Layer 6: Monitoring/Evaluation (200 lines)
15. Final Directive (50 lines)

## 3.2 Dynamic Prompt Sections

### First Message vs Follow-up

```typescript
${isFirstMessage ? `
**THIS IS THE FIRST MESSAGE** - Greet the visitor warmly:
${receptionist.greeting_message ? `"${receptionist.greeting_message}"` : `"Hello! Welcome to ${receptionist.business_name}. I'm ${receptionist.name}, and I'm here to help. What can I do for you today?"`}

- **ONLY** greet once
- **NEVER** greet again during this session
- **NEVER** restart unless user restarts
` : `
**THIS IS A FOLLOW-UP MESSAGE** - Greeting has ALREADY occurred.
- **DO NOT** say "Hello", "Hi", "Welcome", or any greeting
- **DO NOT** re-introduce yourself
- **CONTINUE** the conversation naturally from where it left off
- Reference context from earlier in the conversation
`}
```

### Emotional Guidance Injection

```typescript
const emotionalGuidance = {
  neutral: 'Maintain a warm, professional tone.',
  positive: 'Match their positive energy with enthusiasm.',
  negative: 'Be extra reassuring and empathetic.',
  urgent: 'Prioritize their needs immediately with calm urgency.',
  frustrated: 'Show deep empathy, apologize if appropriate, and focus on solutions.'
};

// Injected into prompt:
### Current Emotional Guidance:
${emotionalGuidance[context.emotionalState]}
```

### Message-Type-Specific Rules

Injected based on `messageAnalysis`:
- `isAcknowledgment` → Short response rules
- `isCorrection` → Update and acknowledge rules
- `hasPronounAmbiguity` → Resolution rules
- `hasNumericQuery` → Calculation rules

## 3.3 Sub-Prompts

### Slot Extraction Prompt (chat/index.ts lines 261-277)

```typescript
const slotPrompt = `You are a slot extraction assistant. Extract booking information from user text and return ONLY valid JSON with these exact keys:
- intent: "book_appointment" or "none"
- service: string (service name) or null
- date: ISO date string (YYYY-MM-DD) or null
- time: time string (HH:MM in 24h format) or null
- customer_name: string or null
- contact: phone or email string or null
- clarity: "clear" or "uncertain"

Rules:
- If ANY required field (service, date, time) is missing or unclear, set clarity to "uncertain"
- Parse relative dates like "tomorrow", "next Monday" into ISO format
- Parse times like "3pm", "2:30" into 24h format (e.g., "15:00", "14:30")
- Extract contact from patterns like "+234...", "email@..." 
- If you cannot extract reliable information, set that key to null

Return ONLY valid JSON, no explanations or markdown.`;
```

---

# SECTION 4 — CONVERSATION FLOW & STATE

## 4.1 Session ID Creation

**Location:** `src/pages/Widget.tsx` lines 59-68

```typescript
useEffect(() => {
  if (!receptionistId) return;
  
  let sid = localStorage.getItem(`widget_session_${receptionistId}`);
  if (!sid) {
    sid = crypto.randomUUID();
    localStorage.setItem(`widget_session_${receptionistId}`, sid);
  }
  setSessionId(sid);
}, [receptionistId]);
```

**Key:** `widget_session_{receptionistId}` in localStorage
**Value:** UUID v4

## 4.2 History Retrieval

**Location:** `supabase/functions/widget-chat/index.ts` lines 2720-2730

```typescript
const { data: history } = await supabase
  .from("chat_messages")
  .select("sender, message, metadata, created_at")
  .eq("receptionist_id", receptionistId)
  .eq("session_id", sessionId || "default")
  .order("created_at", { ascending: true })
  .limit(50);
```

**Limit:** 50 messages per session
**Order:** Ascending (oldest first)

## 4.3 Greeting Logic

### First Message Detection

```typescript
const { data: existingMessages } = await supabase
  .from("chat_messages")
  .select("id")
  .eq("receptionist_id", receptionistId)
  .eq("session_id", sessionId || "default")
  .limit(1);

const isFirstMessage = !existingMessages || existingMessages.length === 0;
```

### Greeting Storage (Empty Message)

```typescript
if (message === "") {
  const { data: existing } = await supabase
    .from("chat_messages")
    .select("id")
    .eq("receptionist_id", receptionistId)
    .eq("session_id", sessionId || "default")
    .eq("sender", "bot")
    .limit(1);

  if (existing && existing.length > 0) {
    return { ok: true, message: "greeting already stored" };
  }

  await supabase.from("chat_messages").insert({
    receptionist_id: receptionistId,
    session_id: sessionId || "default",
    user_id: sessionId || "anonymous",
    sender: "bot",
    message: greetingMessage,
    metadata: { greeting: true, ... }
  });
}
```

## 4.4 Known Issues

1. **Re-greeting Bug Mitigation:**
   - `isFirstMessage` check based on DB history
   - Prompt injection: "DO NOT greet again"
   - Empty message handling for proactive greeting storage

2. **Session Isolation:**
   - Uses `session_id` consistently (not `user_id`)
   - Critical comment at line 2619: "CRITICAL: Use session_id consistently"

3. **Memory Mismatch:**
   - 50-message limit may truncate long sessions
   - No explicit summarization for old messages

---

# SECTION 5 — MEMORY ARCHITECTURE

## 5.1 Short-Term Memory

**Storage:** `chat_messages` table, filtered by `session_id`
**Retention:** 50 messages per request (oldest dropped beyond limit)
**Structure:**
```typescript
{
  id: uuid,
  receptionist_id: uuid,
  session_id: string,
  user_id: string,
  sender: 'user' | 'bot',
  message: string,
  metadata: {
    timestamp: string,
    intent?: string,
    is_acknowledgment?: boolean,
    is_correction?: boolean,
    quality_metrics?: QualityMetrics,
    context_used?: object
  },
  created_at: timestamp
}
```

## 5.2 Context Extraction

All entity extraction happens per-request from history scan:
- Service, date, time via regex
- Name, phone, email via regex
- Emotional state via keyword matching
- Conversation phase via logic

**No persistent context storage** - rebuilt each request.

## 5.3 What Is Stored

- All user messages with metadata
- All bot replies with quality metrics
- Safety violations flagged
- Booking flow state in metadata

## 5.4 What Is Discarded

- Messages beyond 50-message limit
- No summarization of old context
- No explicit memory pruning

## 5.5 Known Weaknesses

1. **No Long-Term Memory:** Sessions reset when localStorage cleared
2. **50-Message Limit:** Long conversations lose early context
3. **Per-Request Rebuild:** No cached context between requests
4. **Regex-Based Extraction:** May miss complex entity patterns

---

# SECTION 6 — DATA ACCESS & SECURITY

## 6.1 Tables Used by AI

### `receptionists`

**Purpose:** Store receptionist configuration and persona
**Fields Accessed:**
- `id`, `name`, `business_name`
- `greeting_message`, `persona_description`
- `tone`, `model`, `temperature`
- `timezone`, `knowledge_base`
- `active` (filter)

**RLS Policies:**
- Authenticated owners can access own receptionists
- Public can access active receptionists via secure view functions
- Anonymous denied direct access

### `chat_messages`

**Purpose:** Store conversation history
**Fields Accessed:**
- All fields (sender, message, metadata, created_at)

**RLS Policies:**
- Users can create for their own receptionists
- Widget users can create with session
- Widget users can read own session messages

**Known Risk:** Session ID is user-provided, potential for session hijacking

### `receptionist_faqs`

**Purpose:** Curated FAQ knowledge base
**Fields Accessed:** `question`, `answer`, `priority`

**RLS Policies:**
- Public can view for active receptionists (read-only)
- Owners can CRUD

### `services`

**Purpose:** Available services for booking
**Fields Accessed:** `id`, `name`, `description`, `duration_minutes`

**RLS Policies:**
- Public can view active services for widget
- Owners can CRUD

### `appointments`

**Purpose:** Store bookings
**Fields Accessed:** All

**RLS Policies:**
- Anonymous denied
- Users can CRUD for own receptionists

### `conversations`

**Purpose:** Analytics log
**Fields Accessed:** All

**RLS Policies:**
- Anonymous denied
- Users can create/view/delete for own receptionists

---

# SECTION 7 — EDGE FUNCTIONS & BACKEND LOGIC

## 7.1 `widget-chat/index.ts`

**Lines:** 2938
**Trigger:** POST from widget frontend
**Inputs:**
```typescript
{
  message: string,
  receptionistId: string,
  sessionId: string,
  displayedGreeting?: string,
  bookingContext?: object,
  source?: string
}
```

**Outputs:**
```typescript
{
  reply: string,
  hasBookingIntent: boolean,
  receptionistName?: string,
  businessName?: string,
  qualityScore?: number
}
```

**Side Effects:**
- Writes to `chat_messages`
- Writes to `conversations`
- Rate limit tracking (in-memory)

**Sync/Async:** Synchronous (waits for AI response)

## 7.2 `chat/index.ts`

**Lines:** 680
**Trigger:** POST from authenticated API
**Key Differences:**
- Uses A/B testing (`assignVariant`)
- Has explicit slot extraction for booking
- Calls `book-appointment` directly
- Uses `idempotencyKey` for duplicate prevention

**Inputs:**
```typescript
{
  messages: Array<{role, content}>,
  receptionistId: string,
  userId: string
}
```

**Booking Sub-Flow:**
1. Detect booking intent via keywords
2. Call Lovable AI for slot extraction
3. Parse JSON slots
4. Check missing fields → ask clarifying question
5. Parse datetime with timezone
6. Call `check-availability`
7. If unavailable → offer alternatives
8. If available → collect contact → call `book-appointment`

## 7.3 `book-appointment/index.ts`

**Trigger:** POST from chat functions or direct API
**Inputs:**
```typescript
{
  receptionistId: string,
  serviceId?: string,
  startTime: string,
  customerName: string,
  customerEmail?: string,
  customerPhone?: string,
  source?: string,
  metadata?: object
}
```

**Logic:**
1. Rate limit check
2. Input sanitization
3. Validate email/phone format
4. Fetch service details
5. Calculate end time with buffers
6. Check idempotency (existing appointment)
7. Check for time conflicts
8. Generate cancellation/confirmation tokens
9. Insert appointment
10. Log to `appointment_logs`
11. Insert notification
12. Invoke `send-booking-email`

**Outputs:**
```typescript
{
  success: boolean,
  appointment: object,
  existed?: boolean
}
```

## 7.4 `check-availability/index.ts`

**Trigger:** POST from chat functions
**Inputs:**
```typescript
{
  receptionistId: string,
  serviceId?: string,
  startDate: string,
  endDate: string,
  desiredStart?: string,
  desiredEnd?: string,
  maxSlots?: number
}
```

**Logic:**
1. Fetch `availability_rules` for receptionist
2. Fetch `availability_exceptions`
3. Fetch existing `appointments`
4. Generate potential slots from rules
5. Filter against exceptions and conflicts
6. If `desiredStart` provided, check exact match
7. Score and rank alternatives

**Outputs:**
```typescript
{
  success: boolean,
  available: boolean,
  slots: Array<string>,
  alternatives?: Array<string>,
  service?: object
}
```

## 7.5 `appointment-action/index.ts`

**Trigger:** GET/POST with token parameters
**Purpose:** Handle confirm/cancel via email links

**Logic:**
1. Extract `action`, `appointmentId`, `token` from query
2. Validate token matches DB
3. Update appointment status
4. Log action
5. Send notification

---

# SECTION 8 — ERROR HANDLING & FALLBACKS

## 8.1 Error Detection

**Rate Limits:**
```typescript
const RATE_LIMIT = { windowMs: 60_000, maxRequests: 30 };

function checkRateLimit(sessionId: string): { allowed: boolean; retryAfterMs?: number } {
  // In-memory sliding window
  // Cleanup when store > 5000 entries
}
```

**AI API Errors:**
```typescript
if (!aiRes.ok) {
  if (aiRes.status === 429) {
    return { error: "Service is busy. Please try again in a moment." };
  }
  if (aiRes.status === 402) {
    return { error: "Service temporarily unavailable." };
  }
  throw new Error("AI request failed");
}
```

## 8.2 AI Failure Fallback

```typescript
if (!out?.choices?.[0]?.message?.content) {
  reply = receptionist.default_response || "I'm having trouble processing that. Please try again.";
}
```

## 8.3 Booking Failure

**Slot Parse Failure:**
```typescript
const clarify = "I can help book that appointment. Could you tell me which service you need, your preferred date and time?";
```

**Availability Check Failure:**
```typescript
const errMsg = "I can't check availability right now. Please try again shortly.";
```

**Book Appointment Failure:**
```typescript
const errMsg = "Sorry, I couldn't create that appointment right now. Please try again in a moment.";
```

## 8.4 Silent Failures

1. **Message Logging Failures:** Caught and logged, not surfaced to user
2. **Analytics Logging Failures:** Caught and logged, not surfaced to user
3. **Notification Insert Failures:** Not explicitly caught

## 8.5 Retry Logic

```typescript
// From bookingHelpers.ts
async function retryWithBackoff<T>(
  fn: () => Promise<T>, 
  maxAttempts: number = 2, 
  initialDelayMs: number = 1000
): Promise<T> {
  let lastError: Error;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, initialDelayMs * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError!;
}
```

---

# SECTION 9 — QUALITY CONTROL & SAFETY

## 9.1 Response Quality Evaluation

**Scoring (0-1 scale):**
- Relevance: 25% weight
- Empathy: 20% weight
- Clarity: 20% weight
- Factuality: 20% weight
- Naturalness: 15% weight

**Threshold:** 0.7 overall to pass

## 9.2 Heuristics

**Robotic Phrase Detection:**
- List of 11 forbidden phrases
- Score penalty per match

**Repetition Detection:**
- Compare last 3 bot messages
- Score penalty if duplicate content

**Greeting-in-followup Detection:**
- Check if reply starts with greeting
- Check if history.length > 2
- Score penalty if both true

## 9.3 Safety Filters

**Pre-processing:**
- Safety classifier runs BEFORE any AI call
- Blocks jailbreak, harmful, PII, bias triggers

**Post-processing:**
- Quality metrics logged but not enforced
- No response rejection based on quality

## 9.4 Rate Limiting

**Widget Chat:**
- 30 requests per 60 seconds per session
- In-memory sliding window

**Book Appointment:**
- Custom rate limit per receptionist and user

---

# SECTION 10 — KNOWN ISSUES & TECH DEBT

## 10.1 Bugs

1. **Potential Re-greeting:** Despite mitigations, edge cases may exist
2. **Session ID Trust:** Widget session ID is user-provided, no server validation
3. **Context Window:** 50-message limit may drop critical context

## 10.2 Architectural Weaknesses

1. **Monolithic Prompt:** 2,500+ line system prompt is unwieldy
2. **Duplicate Code:** Safety patterns defined in both widget-chat and shared module
3. **No Prompt Versioning:** Changes not tracked
4. **Inline Logic:** Complex reasoning mixed with I/O handling

## 10.3 Performance Risks

1. **Per-Request Context:** Full history scan on every message
2. **No Caching:** Knowledge base rebuilt each request
3. **Synchronous AI Calls:** No streaming, full response wait

## 10.4 Security Concerns

1. **Session Hijacking:** Client-provided session ID
2. **Rate Limit Bypass:** New session ID = new rate limit
3. **No Input Length Validation:** Only 2000 char limit in sanitizer

## 10.5 Incomplete Features

1. **No Summarization:** Old messages just truncated
2. **No A/B Testing in Widget:** Only in chat function
3. **No Streaming:** Full response wait
4. **No Speech/Voice:** Text only

## 10.6 TODOs (Found in Code)

- None explicitly marked

---

# SECTION 11 — FILE & MODULE MAP

| File | Lines | Responsibility |
|------|-------|---------------|
| `supabase/functions/widget-chat/index.ts` | 2938 | **MONOLITHIC** - Main widget chat handler with all 7 layers embedded |
| `supabase/functions/chat/index.ts` | 680 | Authenticated chat with A/B testing and booking flow |
| `supabase/functions/book-appointment/index.ts` | ~400 | Appointment creation with idempotency |
| `supabase/functions/check-availability/index.ts` | ~280 | Availability checking logic |
| `supabase/functions/_shared/ai-chat/index.ts` | 18 | Module exports |
| `supabase/functions/_shared/ai-chat/safety.ts` | 74 | Safety patterns and classifier |
| `supabase/functions/_shared/ai-chat/intent.ts` | 197 | Intent detection and dialog acts |
| `supabase/functions/_shared/ai-chat/context.ts` | 152 | Context extraction |
| `supabase/functions/_shared/ai-chat/micro-behavior.ts` | 118 | Natural language patterns |
| `supabase/functions/_shared/ai-chat/quality-metrics.ts` | 295 | Quality scoring and KPIs |
| `supabase/functions/_shared/bookingHelpers.ts` | ~125 | Date parsing, retry logic |
| `src/pages/Widget.tsx` | 601 | Frontend widget component |

## Overloaded Files

1. **`widget-chat/index.ts` (2938 lines):** Contains ALL layers, should be modularized
2. **Duplicate Safety:** Patterns in both `widget-chat` and `_shared/ai-chat/safety.ts`

---

# APPENDIX A — COMPLETE PROMPT TEXT

## Master System Prompt (Abbreviated Structure)

```
# 📌 YOU ARE: ${receptionist.name}
You are the AI receptionist for ${receptionist.business_name}.

# 📌 SECTION 1 — ENVIRONMENT & CONTEXT
[Context loading rules]

# 📌 SECTION 2 — MEMORY & CONTEXT
### Conversation Summary:
${conversationSummary}

### Collected Entities:
[serviceMentioned, dateMentioned, timeMentioned, customerName, customerPhone, customerEmail]

# 📌 SECTION 3 — INTENT, ENTITY, AND DIALOG ACT ENGINE
[Intent recognition rules]
[Entity extraction rules]
[Dialog act selection rules]

# 📌 SECTION 4 — TONE, PERSONALITY, AND STYLE RULES
[Natural language requirements]
[Style matching logic]
[Variation rules]

# 📌 SECTION 5 — KNOWLEDGE-GROUNDED ANSWERING
${knowledgeBase}

# 📌 SECTION 6 — REASONING, LOGIC, AND NON-HALLUCINATION
[Zero guessing rule]
[Logic checks]
[Contradiction prevention]

# 📌 SECTION 7 — ERROR HANDLING
[Vague input handling]
[Incomplete info handling]
[Confusing info handling]

# 📌 SECTION 8 — EMOTIONAL INTELLIGENCE
[Frustration, confusion, urgency, gratitude handling]

# 📌 SECTION 9 — SAFETY, ETHICS, PRIVACY
[Safety rules]
[Privacy rules]
[Escalation rules]
[Jailbreak defense]

# 📌 SECTION 10 — CONVERSATION FLOW LOGIC
${isFirstMessage ? [greeting rules] : [follow-up rules]}

# 📌 LAYER 3: ADVANCED CONVERSATIONAL INTELLIGENCE
[3A: Failure mode patches]
[3B: Micro-behavior engine]
[3C-3M: Various sub-systems]

# 📌 LAYER 5: S-TIER FAILURE PREVENTION
[5A: High-risk patterns]
[5B: Auto-correction engine]
[5C: Hallucination prevention]
[5D: Micro-dialogue]
[5E: Red-team resistance]
[5F: Consistency rules]
[5G: Mandatory principles]

# 📌 LAYER 6: MONITORING & EVALUATION
[6A-6H: Self-check systems]

# 📌 FINAL DIRECTIVE
[Quality target statement]
```

---

# APPENDIX B — DATABASE SCHEMA (Relevant Tables)

## chat_messages
```sql
id uuid PRIMARY KEY,
receptionist_id uuid NOT NULL,
session_id text,
user_id uuid NOT NULL,
sender text NOT NULL,
message text NOT NULL,
metadata jsonb,
created_at timestamptz DEFAULT now()
```

## receptionists
```sql
id uuid PRIMARY KEY,
user_id uuid NOT NULL,
name text NOT NULL,
business_name text NOT NULL,
greeting_message text,
persona_description text,
tone receptionist_tone,
model text DEFAULT 'google/gemini-2.5-flash',
temperature numeric DEFAULT 0.7,
timezone text DEFAULT 'UTC',
knowledge_base text,
active boolean DEFAULT true,
...
```

## appointments
```sql
id uuid PRIMARY KEY,
receptionist_id uuid NOT NULL,
customer_name text NOT NULL,
customer_email text,
customer_phone text,
service text NOT NULL,
service_id uuid,
start_time timestamptz NOT NULL,
end_time timestamptz NOT NULL,
status appointment_status DEFAULT 'booked',
cancellation_token text,
confirmation_token text,
idempotency_key text,
metadata jsonb,
...
```

---

# APPENDIX C — API ENDPOINTS

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/functions/v1/widget-chat` | POST | None | Widget chat |
| `/functions/v1/chat` | POST | JWT | API chat |
| `/functions/v1/book-appointment` | POST | None | Create booking |
| `/functions/v1/check-availability` | POST | None | Check slots |
| `/functions/v1/confirm-appointment` | POST | Token | Confirm booking |
| `/functions/v1/cancel-appointment` | POST | Token | Cancel booking |

---

**END OF AUDIT DOCUMENT**
