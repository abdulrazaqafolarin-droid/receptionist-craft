// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED ENGINE v2 - PERSONALITY ENGINE
// ═══════════════════════════════════════════════════════════════════════════
// 
// Human-like response generation. Sentiment detection. Tone adaptation.
// Makes the AI feel warm, professional, and genuinely helpful.
// ═══════════════════════════════════════════════════════════════════════════

import type { EmotionalTone, EngineState } from './types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// ROBOTIC PHRASES TO AVOID (Prompt-level guidance only)
// ═══════════════════════════════════════════════════════════════════════════

// These phrases are flagged in the system prompt as overused.
// They are NOT stripped post-generation — that corrupts sentence structure.
// The LLM is instructed to prefer fresher language for these.
export const ROBOTIC_PHRASES = [
  'kindly',
  'as per',
  'regarding your',
  'in order to',
  'at this time',
  'please be advised',
  'rest assured',
];

// ═══════════════════════════════════════════════════════════════════════════
// TRULY ROBOTIC PHRASES (Post-generation strip targets)
// These are genuinely robotic/fake-chatbot phrases that should be removed
// from output. They are unambiguous and safe to strip without breaking grammar.
// ═══════════════════════════════════════════════════════════════════════════

export const STRIP_PHRASES = [
  'as an ai',
  'i am a bot',
  "i'm a bot",
  'i am an ai',
  "i'm an ai",
  'i am programmed',
  "i'm programmed",
];

// ═══════════════════════════════════════════════════════════════════════════
// NATURAL ACKNOWLEDGMENTS
// ═══════════════════════════════════════════════════════════════════════════

export const NATURAL_ACKS: Record<EmotionalTone, string[]> = {
  neutral: [
    'Got it!',
    'Perfect.',
    'Great!',
    'Sounds good.',
    'Okay!',
    'All set.',
    'Noted.',
  ],
  positive: [
    'Wonderful!',
    'Excellent choice!',
    'That\'s great!',
    'Perfect!',
    'Awesome!',
    'Love it!',
  ],
  negative: [
    'I hear you.',
    'I understand.',
    'Let me help with that.',
    'Sorry to hear that.',
    'Let\'s fix this.',
  ],
  urgent: [
    'Right away.',
    'Let\'s get this sorted.',
    'On it.',
    'Let me help immediately.',
    'I\'ve got you.',
  ],
  frustrated: [
    'I completely understand.',
    'Let me make this right.',
    'I\'m here to help.',
    'Let\'s get this resolved.',
    'I hear your frustration.',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// SENTIMENT DETECTION
// ═══════════════════════════════════════════════════════════════════════════

export function detectSentiment(message: string): EmotionalTone {
  const lower = message.toLowerCase();
  
  // SARCASM DETECTION: Words like "great", "perfect", "wonderful" that appear
  // in a negative/venting context with intensifiers or contradictory phrases
  const sarcasmIndicators = /(?:great|perfect|wonderful|awesome|fantastic|lovely|just\s*great|oh\s*great)\s*[.!]*\s*,?\s*(?:\.\s*\.\s*\.|!|just|another|more|even|thing)|(?:yeah|sure)\s*(right|because)|as\s*if/i;
  const negativityContext = /(?:can't|cannot|don't|doesn't|won't)\s*(?:even|ever|just)|(?:another|more)\s+(?:problem|issue|hassle|headache|thing|one|delay|charge|bill|fee)|(?:what\s*next|here\s*we\s*go)|(?:have|has|had)\s*to\s*deal\s*with/i;
  const exclamationDensity = (message.match(/!/g) || []).length;
  
  if (sarcasmIndicators.test(lower) && negativityContext.test(lower)) {
    return 'frustrated';
  }
  // "Great." or "Perfect." as standalone sentences (sarcastic)
  if (/^(great|perfect|wonderful|fantastic|lovely)\.?$/i.test(message.trim()) && exclamationDensity === 0) {
    return 'frustrated';
  }
  
  // Frustrated
  if (/frustrated|annoyed|angry|upset|terrible|awful|worst|ridiculous|unacceptable|hate/i.test(lower)) {
    return 'frustrated';
  }
  
  // Urgent
  if (/urgent|asap|emergency|immediately|right now|quickly|hurry|rush/i.test(lower)) {
    return 'urgent';
  }
  
  // Negative
  if (/problem|issue|wrong|bad|disappointed|confused|don't understand|help me/i.test(lower)) {
    return 'negative';
  }
  
  // Positive (only if not in sarcasm context)
  if (/great|awesome|wonderful|perfect|love|amazing|thank|excited|happy/i.test(lower)) {
    return 'positive';
  }
  
  return 'neutral';
}

// ═══════════════════════════════════════════════════════════════════════════
// NATURAL RESPONSE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export function getRandomAck(tone: EmotionalTone): string {
  const options = NATURAL_ACKS[tone] || NATURAL_ACKS.neutral;
  return options[Math.floor(Math.random() * options.length)];
}

// ═══════════════════════════════════════════════════════════════════════════
// PERSONALITY PROMPT BLOCK
// ═══════════════════════════════════════════════════════════════════════════

export function buildPersonalityPrompt(
  tone: EmotionalTone,
  businessName: string,
  receptionistName: string,
  businessTone: 'professional' | 'friendly' | 'casual' | 'formal' = 'friendly'
): string {
  const toneDescriptions: Record<typeof businessTone, string> = {
    professional: 'Professional but warm. Efficient yet personable.',
    friendly: 'Warm, conversational, and genuinely helpful.',
    casual: 'Relaxed, casual, and approachable. Like chatting with a friend.',
    formal: 'Polite, respectful, and precise. Maintains professional distance.',
  };

  return `
# 🎭 PERSONALITY ENGINE

## Your Identity
You are ${receptionistName}, a helpful assistant for ${businessName}.
Your tone is: ${toneDescriptions[businessTone]}

## Current User Emotional State: ${tone.toUpperCase()}
${tone === 'frustrated' ? 'User seems frustrated. Be extra empathetic and solution-focused.' : ''}
${tone === 'urgent' ? 'User has urgency. Be quick and efficient.' : ''}
${tone === 'negative' ? 'User has a concern. Acknowledge it and focus on helping.' : ''}
${tone === 'positive' ? 'User is happy! Match their energy appropriately.' : ''}

## Response Style Rules

1. **BE HUMAN**: Sound like a helpful person, not a chatbot
2. **VARY LANGUAGE**: Never use the same phrase twice in a conversation
3. **BE BRIEF**: 1-2 sentences unless more detail is needed
4. **BE WARM**: Care about the customer genuinely

## AVOID OVERUSING:
${ROBOTIC_PHRASES.map(p => `• "${p}"`).join('\n')}
• "Certainly", "Of course", "I'd be happy to" — fine in small doses, don't repeat
• Starting with "I" multiple times in a row
• Excessive exclamation marks!!!

## GOOD ACKNOWLEDGMENTS:
${NATURAL_ACKS[tone].slice(0, 4).map(a => `• "${a}"`).join('\n')}

## Response Structure
- Start with a brief acknowledgment (if appropriate)
- Give the information or ask the question
- End naturally (no forced closings like "Is there anything else?")
`;
}

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSE POST-PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

export function polishResponse(response: string): string {
  let polished = response;
  
  // Remove ONLY truly robotic phrases (AI disclaimers) — post-generation
  // Do NOT strip natural speech like "certainly", "thank you", "i understand"
  for (const phrase of STRIP_PHRASES) {
    const regex = new RegExp(`\\b${phrase}\\b[!.,]?\\s*`, 'gi');
    polished = polished.replace(regex, '');
  }
  
  // Remove double spaces caused by stripping
  polished = polished.replace(/\s{2,}/g, ' ');
  
  // Remove leading punctuation
  polished = polished.replace(/^[.,!?\s]+/, '');
  
  // Capitalize first letter
  if (polished.length > 0) {
    polished = polished.charAt(0).toUpperCase() + polished.slice(1);
  }
  
  return polished.trim();
}
