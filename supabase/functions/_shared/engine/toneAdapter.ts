// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED ENGINE v2 - DYNAMIC TONE ADAPTER
// ═══════════════════════════════════════════════════════════════════════════
// 
// Adapts AI communication style based on business type, user emotion, and context.
// Ensures the AI sounds appropriate for the specific business personality.
// ═══════════════════════════════════════════════════════════════════════════

import type { EmotionalTone } from './types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// BUSINESS TONE PROFILES
// ═══════════════════════════════════════════════════════════════════════════

export type BusinessTone = 'professional' | 'friendly' | 'casual' | 'formal' | 'luxury' | 'playful';

export interface ToneProfile {
  tone: BusinessTone;
  greeting: string;
  acknowledgments: string[];
  closings: string[];
  emoji: boolean;
  maxExclamations: number;
  formality: number; // 0-1 scale
  warmth: number; // 0-1 scale
}

export const TONE_PROFILES: Record<BusinessTone, ToneProfile> = {
  professional: {
    tone: 'professional',
    greeting: 'Hello! How can I help you today?',
    acknowledgments: ['Got it.', 'Understood.', 'Perfect.', 'That works.', 'Noted.'],
    closings: ['Have a great day!', 'Take care!', 'Thanks for reaching out!'],
    emoji: false,
    maxExclamations: 2,
    formality: 0.7,
    warmth: 0.6,
  },
  friendly: {
    tone: 'friendly',
    greeting: 'Hey there! Great to have you. What can I do for you?',
    acknowledgments: ['Got it!', 'Awesome!', 'Perfect!', 'Sounds good!', 'Great!'],
    closings: ['Have a wonderful day! 😊', 'Take care!', 'Chat soon!'],
    emoji: true,
    maxExclamations: 3,
    formality: 0.4,
    warmth: 0.9,
  },
  casual: {
    tone: 'casual',
    greeting: 'Hey! What\'s up?',
    acknowledgments: ['Cool!', 'Nice!', 'Sweet!', 'Gotcha!', 'Yep!'],
    closings: ['Catch you later!', 'Peace!', 'Later! ✌️'],
    emoji: true,
    maxExclamations: 4,
    formality: 0.2,
    warmth: 0.8,
  },
  formal: {
    tone: 'formal',
    greeting: 'Good day. How may I be of assistance?',
    acknowledgments: ['Understood.', 'Noted.', 'Certainly.', 'Very well.', 'Of course.'],
    closings: ['Thank you for your time.', 'Best regards.', 'We appreciate your business.'],
    emoji: false,
    maxExclamations: 1,
    formality: 0.95,
    warmth: 0.4,
  },
  luxury: {
    tone: 'luxury',
    greeting: 'Welcome. It\'s a pleasure to assist you.',
    acknowledgments: ['Excellent choice.', 'Wonderful.', 'A fine selection.', 'Splendid.'],
    closings: ['It has been a pleasure.', 'We look forward to serving you again.'],
    emoji: false,
    maxExclamations: 1,
    formality: 0.9,
    warmth: 0.7,
  },
  playful: {
    tone: 'playful',
    greeting: 'Heyyy! 🎉 What can I help with today?',
    acknowledgments: ['Yayyy!', 'Love it!', 'Ooh nice!', 'Heck yes!', 'Awesome sauce!'],
    closings: ['Byeee! 👋', 'Have an amazing day! 🌟', 'You rock! 🤘'],
    emoji: true,
    maxExclamations: 5,
    formality: 0.1,
    warmth: 1.0,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// BUSINESS TYPE TO TONE MAPPING
// ═══════════════════════════════════════════════════════════════════════════

export function detectBusinessTone(businessType?: string, explicitTone?: string): BusinessTone {
  // Use explicit tone if provided
  if (explicitTone && explicitTone in TONE_PROFILES) {
    return explicitTone as BusinessTone;
  }
  
  if (!businessType) return 'friendly';
  
  const lower = businessType.toLowerCase();
  
  // Formal/Luxury businesses
  if (/law|legal|attorney|finance|bank|invest|medical|doctor|hospital|clinic/i.test(lower)) {
    return 'formal';
  }
  if (/luxury|spa|resort|fine dining|jewelry|boutique/i.test(lower)) {
    return 'luxury';
  }
  
  // Casual businesses
  if (/coffee|cafe|food truck|bar|pub|tattoo|skate|surf/i.test(lower)) {
    return 'casual';
  }
  
  // Playful businesses
  if (/party|entertainment|kids|pet|toy|game|arcade/i.test(lower)) {
    return 'playful';
  }
  
  // Professional businesses
  if (/consulting|agency|corporate|b2b|enterprise/i.test(lower)) {
    return 'professional';
  }
  
  // Default to friendly for most small businesses
  return 'friendly';
}

// ═══════════════════════════════════════════════════════════════════════════
// ADAPTIVE TONE ADJUSTMENT
// ═══════════════════════════════════════════════════════════════════════════

export interface AdaptedTone {
  profile: ToneProfile;
  adjustments: string[];
  temperature: number;
}

export function adaptTone(
  baseTone: BusinessTone,
  emotionalTone: EmotionalTone,
  isFirstMessage: boolean,
  urgencyLevel: 'normal' | 'high' | 'critical' = 'normal'
): AdaptedTone {
  const profile = { ...TONE_PROFILES[baseTone] };
  const adjustments: string[] = [];
  let temperature = 0.85; // Default for natural conversation
  
  // Adjust for emotional state
  if (emotionalTone === 'frustrated') {
    profile.warmth = Math.min(1, profile.warmth + 0.3);
    profile.emoji = false; // No emojis when frustrated
    profile.maxExclamations = 1; // Tone down excitement
    adjustments.push('Increased empathy and reduced playfulness');
    temperature = 0.75; // More focused
  }
  
  if (emotionalTone === 'urgent' || urgencyLevel === 'critical') {
    profile.formality = Math.min(1, profile.formality + 0.2);
    profile.emoji = false;
    adjustments.push('More direct and efficient communication');
    temperature = 0.7; // Very focused
  }
  
  if (emotionalTone === 'positive') {
    profile.warmth = Math.min(1, profile.warmth + 0.2);
    adjustments.push('Matching positive energy');
    temperature = 0.9; // More creative/warm
  }
  
  // First message adjustments
  if (isFirstMessage) {
    profile.warmth = Math.min(1, profile.warmth + 0.1);
    adjustments.push('Extra warmth for first impression');
  }
  
  return { profile, adjustments, temperature };
}

// ═══════════════════════════════════════════════════════════════════════════
// TONE ADAPTATION PROMPT
// ═══════════════════════════════════════════════════════════════════════════

export function buildTonePrompt(adapted: AdaptedTone, businessName: string, receptionistName: string): string {
  const { profile, adjustments } = adapted;
  
  return `
# 🎭 COMMUNICATION STYLE

## Your Voice as ${receptionistName} for ${businessName}
- **Tone**: ${profile.tone.charAt(0).toUpperCase() + profile.tone.slice(1)}
- **Formality Level**: ${Math.round(profile.formality * 100)}%
- **Warmth Level**: ${Math.round(profile.warmth * 100)}%
- **Use Emojis**: ${profile.emoji ? 'Yes, sparingly' : 'No'}
- **Max Exclamations**: ${profile.maxExclamations} per response

## Acknowledgments to Use
${profile.acknowledgments.map(a => `• "${a}"`).join('\n')}

## Closing Phrases
${profile.closings.map(c => `• "${c}"`).join('\n')}

${adjustments.length > 0 ? `## Active Adjustments\n${adjustments.map(a => `• ${a}`).join('\n')}` : ''}

## Tone Rules
- Stay consistent with the ${profile.tone} voice
- Adapt slightly to match user energy
- Never break character or sound robotic
- Keep responses concise and natural
`;
}

// ═══════════════════════════════════════════════════════════════════════════
// MODEL PARAMETERS BASED ON TONE
// ═══════════════════════════════════════════════════════════════════════════

export function getModelParamsForTone(adapted: AdaptedTone): { temperature: number; maxTokens: number } {
  return {
    temperature: adapted.temperature,
    maxTokens: adapted.profile.formality > 0.7 ? 400 : 300, // Formal = more words allowed
  };
}
