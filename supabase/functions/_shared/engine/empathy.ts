// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED ENGINE v2 - EMPATHY & EMOTIONAL INTELLIGENCE LAYER
// ═══════════════════════════════════════════════════════════════════════════
// 
// Advanced emotional awareness. Context-sensitive responses. Deep empathy.
// Makes the AI feel genuinely caring and emotionally intelligent.
// ═══════════════════════════════════════════════════════════════════════════

import type { EmotionalTone } from './types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// EMOTIONAL INTELLIGENCE SIGNALS
// ═══════════════════════════════════════════════════════════════════════════

export interface EmotionalContext {
  primaryEmotion: EmotionalTone;
  intensity: 'low' | 'medium' | 'high';
  signals: string[];
  suggestedApproach: string;
  empathyLevel: number; // 0-1 scale
}

// Detailed emotion patterns with intensity
const EMOTION_PATTERNS: Record<string, { tone: EmotionalTone; intensity: 'low' | 'medium' | 'high'; weight: number }> = {
  // Frustrated - High priority
  'frustrated': { tone: 'frustrated', intensity: 'high', weight: 10 },
  'annoyed': { tone: 'frustrated', intensity: 'medium', weight: 8 },
  'angry': { tone: 'frustrated', intensity: 'high', weight: 10 },
  'upset': { tone: 'frustrated', intensity: 'high', weight: 9 },
  'terrible': { tone: 'frustrated', intensity: 'high', weight: 9 },
  'awful': { tone: 'frustrated', intensity: 'high', weight: 9 },
  'worst': { tone: 'frustrated', intensity: 'high', weight: 10 },
  'ridiculous': { tone: 'frustrated', intensity: 'high', weight: 9 },
  'unacceptable': { tone: 'frustrated', intensity: 'high', weight: 10 },
  'hate': { tone: 'frustrated', intensity: 'high', weight: 10 },
  'sick of': { tone: 'frustrated', intensity: 'high', weight: 9 },
  'fed up': { tone: 'frustrated', intensity: 'high', weight: 9 },
  'can\'t believe': { tone: 'frustrated', intensity: 'medium', weight: 7 },
  'seriously': { tone: 'frustrated', intensity: 'medium', weight: 5 },
  'again': { tone: 'frustrated', intensity: 'low', weight: 3 },
  
  // Urgent - High priority  
  'urgent': { tone: 'urgent', intensity: 'high', weight: 10 },
  'asap': { tone: 'urgent', intensity: 'high', weight: 10 },
  'emergency': { tone: 'urgent', intensity: 'high', weight: 10 },
  'immediately': { tone: 'urgent', intensity: 'high', weight: 9 },
  'right now': { tone: 'urgent', intensity: 'high', weight: 9 },
  'quickly': { tone: 'urgent', intensity: 'medium', weight: 7 },
  'hurry': { tone: 'urgent', intensity: 'high', weight: 8 },
  'rush': { tone: 'urgent', intensity: 'high', weight: 8 },
  'today': { tone: 'urgent', intensity: 'medium', weight: 4 },
  'soon': { tone: 'urgent', intensity: 'low', weight: 3 },
  
  // Negative - Medium priority
  'problem': { tone: 'negative', intensity: 'medium', weight: 6 },
  'issue': { tone: 'negative', intensity: 'medium', weight: 6 },
  'wrong': { tone: 'negative', intensity: 'medium', weight: 6 },
  'bad': { tone: 'negative', intensity: 'medium', weight: 5 },
  'disappointed': { tone: 'negative', intensity: 'high', weight: 8 },
  'confused': { tone: 'negative', intensity: 'medium', weight: 6 },
  'don\'t understand': { tone: 'negative', intensity: 'medium', weight: 6 },
  'help me': { tone: 'negative', intensity: 'low', weight: 4 },
  'struggling': { tone: 'negative', intensity: 'medium', weight: 7 },
  'worried': { tone: 'negative', intensity: 'medium', weight: 6 },
  'concerned': { tone: 'negative', intensity: 'medium', weight: 5 },
  'not working': { tone: 'negative', intensity: 'medium', weight: 7 },
  
  // Positive - Match their energy
  'great': { tone: 'positive', intensity: 'medium', weight: 5 },
  'awesome': { tone: 'positive', intensity: 'high', weight: 7 },
  'wonderful': { tone: 'positive', intensity: 'high', weight: 7 },
  'perfect': { tone: 'positive', intensity: 'high', weight: 7 },
  'love': { tone: 'positive', intensity: 'high', weight: 8 },
  'amazing': { tone: 'positive', intensity: 'high', weight: 8 },
  'thank': { tone: 'positive', intensity: 'medium', weight: 5 },
  'thanks': { tone: 'positive', intensity: 'medium', weight: 5 },
  'excited': { tone: 'positive', intensity: 'high', weight: 7 },
  'happy': { tone: 'positive', intensity: 'medium', weight: 6 },
  'glad': { tone: 'positive', intensity: 'medium', weight: 5 },
  'looking forward': { tone: 'positive', intensity: 'medium', weight: 6 },
  'can\'t wait': { tone: 'positive', intensity: 'high', weight: 7 },
};

// ═══════════════════════════════════════════════════════════════════════════
// ADVANCED SENTIMENT DETECTION
// ═══════════════════════════════════════════════════════════════════════════

export function analyzeEmotionalContext(message: string, history?: { sender: string; message: string }[]): EmotionalContext {
  const lower = message.toLowerCase();
  const signals: string[] = [];
  const scoreMap: Record<EmotionalTone, number> = {
    neutral: 1, // Base score
    positive: 0,
    negative: 0,
    urgent: 0,
    frustrated: 0,
  };
  
  // Analyze current message
  for (const [keyword, config] of Object.entries(EMOTION_PATTERNS)) {
    if (lower.includes(keyword)) {
      scoreMap[config.tone] += config.weight;
      signals.push(keyword);
    }
  }
  
  // Check punctuation signals
  const exclamationCount = (message.match(/!/g) || []).length;
  const capsRatio = (message.match(/[A-Z]/g) || []).length / Math.max(message.length, 1);
  const questionMarks = (message.match(/\?/g) || []).length;
  
  if (exclamationCount >= 3) {
    scoreMap.frustrated += 3;
    signals.push('excessive_exclamation');
  }
  if (capsRatio > 0.5 && message.length > 5) {
    scoreMap.frustrated += 4;
    signals.push('caps_lock');
  }
  if (questionMarks >= 3) {
    scoreMap.negative += 2;
    signals.push('multiple_questions');
  }
  
  // Check for escalating frustration in history
  if (history && history.length > 2) {
    const recentUserMessages = history.filter(m => m.sender === 'user').slice(-3);
    const frustrationEscalation = recentUserMessages.filter(m => {
      const lowerMsg = m.message.toLowerCase();
      return /again|still|already said|told you|repeat/i.test(lowerMsg);
    }).length;
    
    if (frustrationEscalation >= 2) {
      scoreMap.frustrated += 5;
      signals.push('escalating_frustration');
    }
  }
  
  // Determine primary emotion
  const maxScore = Math.max(...Object.values(scoreMap));
  const primaryEmotion = Object.entries(scoreMap).find(([_, score]) => score === maxScore)?.[0] as EmotionalTone || 'neutral';
  
  // Determine intensity
  let intensity: 'low' | 'medium' | 'high' = 'low';
  if (maxScore >= 8) intensity = 'high';
  else if (maxScore >= 4) intensity = 'medium';
  
  // Calculate empathy level needed (0-1)
  const empathyLevel = primaryEmotion === 'frustrated' ? 1 :
                       primaryEmotion === 'negative' ? 0.8 :
                       primaryEmotion === 'urgent' ? 0.7 :
                       primaryEmotion === 'positive' ? 0.5 :
                       0.3;
  
  // Suggest approach
  const suggestedApproach = getSuggestedApproach(primaryEmotion, intensity);
  
  return {
    primaryEmotion,
    intensity,
    signals,
    suggestedApproach,
    empathyLevel,
  };
}

function getSuggestedApproach(emotion: EmotionalTone, intensity: 'low' | 'medium' | 'high'): string {
  const approaches: Record<EmotionalTone, Record<string, string>> = {
    frustrated: {
      high: 'Lead with sincere empathy and validation. Acknowledge their frustration explicitly. Focus solely on resolution. Avoid any defensive language.',
      medium: 'Show understanding and take ownership. Move quickly to solutions. Keep response focused and helpful.',
      low: 'Acknowledge any inconvenience briefly. Stay solution-oriented and efficient.',
    },
    urgent: {
      high: 'Respond with immediate action. Be concise and efficient. Skip pleasantries - get straight to solving their need.',
      medium: 'Show you understand the time sensitivity. Be efficient but thorough.',
      low: 'Be responsive and helpful. Acknowledge their timeline.',
    },
    negative: {
      high: 'Be genuinely empathetic. Validate their concern. Offer clear solutions and reassurance.',
      medium: 'Show understanding. Address the issue directly. Offer to help.',
      low: 'Acknowledge the situation. Be helpful and solution-focused.',
    },
    positive: {
      high: 'Match their enthusiasm! Be warm and genuine. Share in their excitement.',
      medium: 'Be warm and friendly. Reflect their positive energy.',
      low: 'Be pleasant and helpful. Maintain a friendly tone.',
    },
    neutral: {
      high: 'Be warm and professional. Focus on being helpful.',
      medium: 'Be friendly and efficient. Get to the point.',
      low: 'Be clear and helpful. Normal conversational tone.',
    },
  };
  
  return approaches[emotion]?.[intensity] || approaches.neutral.medium;
}

// ═══════════════════════════════════════════════════════════════════════════
// EMPATHY RESPONSE STARTERS
// ═══════════════════════════════════════════════════════════════════════════

export const EMPATHY_STARTERS: Record<EmotionalTone, Record<string, string[]>> = {
  frustrated: {
    high: [
      "I'm really sorry you're dealing with this.",
      "I completely understand your frustration.",
      "That's not the experience we want for you.",
      "I hear you, and I want to make this right.",
    ],
    medium: [
      "I understand this has been frustrating.",
      "Let me help sort this out.",
      "I can see why that would be annoying.",
    ],
    low: [
      "No worries, let me help.",
      "I've got you covered.",
    ],
  },
  urgent: {
    high: [
      "Right away—",
      "I'm on it.",
      "Let's get this sorted immediately.",
    ],
    medium: [
      "I understand you need this quickly.",
      "Let's move fast on this.",
    ],
    low: [
      "No problem.",
    ],
  },
  negative: {
    high: [
      "I'm sorry to hear that.",
      "I understand your concern.",
      "Let me help fix this.",
    ],
    medium: [
      "I hear you.",
      "Let me help with that.",
    ],
    low: [
      "Got it.",
    ],
  },
  positive: {
    high: [
      "That's wonderful!",
      "So glad to hear that!",
      "Excellent!",
    ],
    medium: [
      "Great!",
      "Perfect!",
    ],
    low: [
      "Sounds good!",
    ],
  },
  neutral: {
    high: ["Of course!"],
    medium: ["Sure thing."],
    low: ["Okay."],
  },
};

export function getEmpathyStarter(emotion: EmotionalTone, intensity: 'low' | 'medium' | 'high'): string {
  const starters = EMPATHY_STARTERS[emotion]?.[intensity] || EMPATHY_STARTERS.neutral.medium;
  return starters[Math.floor(Math.random() * starters.length)];
}

// ═══════════════════════════════════════════════════════════════════════════
// EMPATHY PROMPT BLOCK
// ═══════════════════════════════════════════════════════════════════════════

export function buildEmpathyPrompt(context: EmotionalContext): string {
  if (context.empathyLevel < 0.4) {
    return ''; // No special empathy needed
  }
  
  return `
# 🫂 EMPATHY LAYER ACTIVE

## Detected Emotional State
- **Primary Emotion**: ${context.primaryEmotion.toUpperCase()}
- **Intensity**: ${context.intensity}
- **Signals Detected**: ${context.signals.join(', ') || 'none'}

## Your Approach
${context.suggestedApproach}

## Response Guidelines
${context.primaryEmotion === 'frustrated' ? `
- START with genuine acknowledgment of their frustration
- DO NOT be defensive or make excuses
- Focus entirely on resolution
- Use phrases like: "I hear you", "Let me make this right", "I understand"
- Keep your response focused and solution-oriented
` : ''}
${context.primaryEmotion === 'urgent' ? `
- Be CONCISE and ACTION-ORIENTED
- Skip unnecessary pleasantries
- Get straight to solving their need
- Communicate timeline clearly
` : ''}
${context.primaryEmotion === 'negative' ? `
- Acknowledge their concern
- Show you understand their situation
- Be reassuring without being dismissive
- Offer clear next steps
` : ''}
${context.primaryEmotion === 'positive' ? `
- Match their positive energy appropriately
- Be warm and genuine
- Share in their excitement
- Keep the momentum going
` : ''}

## Empathy Level Required: ${Math.round(context.empathyLevel * 100)}%
`;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVERSATION MEMORY AWARENESS
// ═══════════════════════════════════════════════════════════════════════════

export interface ConversationMemory {
  customerName?: string;
  previousMentions: string[];
  repeatedQuestions: string[];
  userPreferences: string[];
  topicsDiscussed: string[];
}

export function analyzeConversationMemory(history: { sender: string; message: string }[]): ConversationMemory {
  const memory: ConversationMemory = {
    previousMentions: [],
    repeatedQuestions: [],
    userPreferences: [],
    topicsDiscussed: [],
  };
  
  if (!history || history.length === 0) return memory;
  
  const userMessages = history.filter(m => m.sender === 'user').map(m => m.message.toLowerCase());
  
  // Detect repeated questions (sign of poor AI performance)
  const questionPatterns: Record<string, number> = {};
  for (const msg of userMessages) {
    if (msg.includes('?')) {
      const simplified = msg.replace(/[^\w\s?]/g, '').slice(0, 30);
      questionPatterns[simplified] = (questionPatterns[simplified] || 0) + 1;
    }
  }
  memory.repeatedQuestions = Object.entries(questionPatterns)
    .filter(([_, count]) => count > 1)
    .map(([q, _]) => q);
  
  // Extract name mentions
  const nameMentions = userMessages.join(' ').match(/my name is (\w+)|i'm (\w+)|call me (\w+)/i);
  if (nameMentions) {
    memory.customerName = nameMentions[1] || nameMentions[2] || nameMentions[3];
  }
  
  // Detect topics discussed
  const topics = new Set<string>();
  for (const msg of userMessages) {
    if (/book|appointment|schedule/i.test(msg)) topics.add('booking');
    if (/price|cost|how much/i.test(msg)) topics.add('pricing');
    if (/order|buy|purchase/i.test(msg)) topics.add('ordering');
    if (/cancel|reschedule/i.test(msg)) topics.add('modification');
    if (/hours|open|close/i.test(msg)) topics.add('hours');
    if (/location|address|where/i.test(msg)) topics.add('location');
  }
  memory.topicsDiscussed = Array.from(topics);
  
  return memory;
}

export function buildMemoryAwarenessPrompt(memory: ConversationMemory): string {
  if (memory.repeatedQuestions.length === 0 && !memory.customerName) {
    return '';
  }
  
  let prompt = `
# 🧠 CONVERSATION MEMORY

`;
  
  if (memory.customerName) {
    prompt += `**Customer Name**: ${memory.customerName} (Use their name occasionally to personalize)\n\n`;
  }
  
  if (memory.repeatedQuestions.length > 0) {
    prompt += `⚠️ **REPEATED QUESTIONS DETECTED** - User has asked similar questions before:
${memory.repeatedQuestions.map(q => `- "${q}"`).join('\n')}

This may indicate:
- Your previous answers weren't clear
- The user is confused
- You may have missed something

ACTION: Give a more complete, clearer answer this time. Reference what you discussed earlier if relevant.
`;
  }
  
  if (memory.topicsDiscussed.length > 0) {
    prompt += `\n**Topics Discussed**: ${memory.topicsDiscussed.join(', ')}\n`;
  }
  
  return prompt;
}
