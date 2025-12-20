// ═══════════════════════════════════════════════════════════════════════════
// MICRO-BEHAVIOR ENGINE - THE "HUMANNESS" PATCHSET
// ═══════════════════════════════════════════════════════════════════════════

export const MICRO_BEHAVIOR = {
  // Natural backchannels (tiny human confirmations)
  naturalAcks: [
    "Alright — let's continue.",
    "Got it!",
    "Okay, perfect.",
    "Sure thing!",
    "Absolutely.",
    "Great!",
    "Sounds good.",
    "No problem!",
    "Of course!",
  ],
  
  // Repair phrases for misunderstandings
  repairPhrases: [
    "Sorry about that — let me correct myself.",
    "Thanks for the clarification!",
    "Ah, got it — my mistake.",
    "I appreciate the correction!",
  ],
  
  // Smooth transitions
  transitionPhrases: [
    "Now, let's",
    "Moving on —",
    "Great! Next,",
    "Perfect. So,",
    "Alright, now",
  ],
  
  // Empathetic responses for confusion
  confusionResponses: [
    "No worries — let me break that down.",
    "Sure, let me simplify that.",
    "Happy to clarify!",
    "Let me explain that differently.",
  ],
  
  // Robotic phrases to NEVER use
  roboticPhrases: [
    'acknowledged', 'affirmative', 'negative', 'noted',
    'as per your request', 'kindly', 'hereby', 'therein',
    'as an ai', 'i am a bot', 'i am programmed',
  ],
};

export function getRandomAck(): string {
  return MICRO_BEHAVIOR.naturalAcks[Math.floor(Math.random() * MICRO_BEHAVIOR.naturalAcks.length)];
}

export function getRandomRepair(): string {
  return MICRO_BEHAVIOR.repairPhrases[Math.floor(Math.random() * MICRO_BEHAVIOR.repairPhrases.length)];
}

export function getRandomTransition(): string {
  return MICRO_BEHAVIOR.transitionPhrases[Math.floor(Math.random() * MICRO_BEHAVIOR.transitionPhrases.length)];
}

export function getConfusionResponse(): string {
  return MICRO_BEHAVIOR.confusionResponses[Math.floor(Math.random() * MICRO_BEHAVIOR.confusionResponses.length)];
}

export function isRoboticPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  return MICRO_BEHAVIOR.roboticPhrases.some(phrase => lower.includes(phrase));
}

export function sanitizeRoboticPhrases(text: string): string {
  let result = text;
  const replacements: { [key: string]: string } = {
    'acknowledged': 'Got it',
    'affirmative': 'Yes',
    'negative': 'No',
    'noted': 'Understood',
    'as per your request': 'As you asked',
    'kindly': 'please',
  };
  
  for (const [robotic, natural] of Object.entries(replacements)) {
    const regex = new RegExp(robotic, 'gi');
    result = result.replace(regex, natural);
  }
  
  return result;
}

// Variation tracking to avoid repetition
const usedPhrases = new Map<string, number>();

export function getVariedPhrase(category: keyof typeof MICRO_BEHAVIOR, sessionId: string): string {
  const phrases = MICRO_BEHAVIOR[category] as string[];
  if (!phrases || phrases.length === 0) return '';
  
  const key = `${sessionId}:${category}`;
  const lastIndex = usedPhrases.get(key) ?? -1;
  
  // Get a different phrase than last time
  let newIndex = Math.floor(Math.random() * phrases.length);
  if (newIndex === lastIndex && phrases.length > 1) {
    newIndex = (newIndex + 1) % phrases.length;
  }
  
  usedPhrases.set(key, newIndex);
  
  // Cleanup old entries periodically
  if (usedPhrases.size > 1000) {
    const entries = Array.from(usedPhrases.entries());
    usedPhrases.clear();
    entries.slice(-500).forEach(([k, v]) => usedPhrases.set(k, v));
  }
  
  return phrases[newIndex];
}
