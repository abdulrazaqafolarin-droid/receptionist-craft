// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED ENGINE v2 - RESPONSE QUALITY EVALUATOR
// ═══════════════════════════════════════════════════════════════════════════
// 
// Real-time quality scoring. Self-improvement signals. Anti-robotic checks.
// Ensures every response meets S-tier quality standards.
// ═══════════════════════════════════════════════════════════════════════════

import type { EmotionalTone } from './types.ts';
import { ROBOTIC_PHRASES } from './personality.ts';

// ═══════════════════════════════════════════════════════════════════════════
// QUALITY METRICS
// ═══════════════════════════════════════════════════════════════════════════

export interface ResponseQuality {
  score: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: QualityIssue[];
  improvements: string[];
  passesThreshold: boolean;
}

export interface QualityIssue {
  type: 'robotic' | 'repetitive' | 'too_long' | 'too_short' | 'off_topic' | 'empathy_missing' | 'greeting_error' | 'pushy';
  severity: 'low' | 'medium' | 'high';
  detail: string;
}

// Extended robotic phrases to avoid
const EXTENDED_ROBOTIC_PHRASES = [
  ...ROBOTIC_PHRASES,
  // Chatbot giveaways
  'as an ai',
  'as a language model',
  'i am here to help',
  'how may i assist you',
  'is there anything else i can help you with today',
  'thank you for reaching out',
  'i hope this helps',
  'feel free to ask',
  'don\'t hesitate to',
  'i would be glad to',
  'it is my pleasure',
  'i am delighted to',
  'allow me to',
  'permit me to',
  // Overly formal
  'pursuant to',
  'in accordance with',
  'with reference to',
  'with regards to your',
  'as stated previously',
  'as mentioned earlier',
  // Generic closings
  'have a wonderful day',
  'have a great rest of your day',
  'wishing you all the best',
];

// ═══════════════════════════════════════════════════════════════════════════
// QUALITY EVALUATION
// ═══════════════════════════════════════════════════════════════════════════

export function evaluateResponseQuality(
  response: string,
  userMessage: string,
  isFirstMessage: boolean,
  emotionalTone: EmotionalTone,
  history?: { sender: string; message: string }[]
): ResponseQuality {
  const issues: QualityIssue[] = [];
  const improvements: string[] = [];
  let score = 100;
  
  const lowerResponse = response.toLowerCase();
  const wordCount = response.split(/\s+/).length;
  
  // ─────────────────────────────────────────────────────────────────────────
  // CHECK 1: Robotic Language
  // ─────────────────────────────────────────────────────────────────────────
  const roboticMatches: string[] = [];
  for (const phrase of EXTENDED_ROBOTIC_PHRASES) {
    if (lowerResponse.includes(phrase)) {
      roboticMatches.push(phrase);
    }
  }
  
  if (roboticMatches.length > 0) {
    score -= roboticMatches.length * 8;
    issues.push({
      type: 'robotic',
      severity: roboticMatches.length >= 3 ? 'high' : 'medium',
      detail: `Contains robotic phrases: ${roboticMatches.slice(0, 3).join(', ')}`,
    });
    improvements.push('Remove AI-sounding phrases. Sound more natural and human.');
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // CHECK 2: Greeting Errors
  // ─────────────────────────────────────────────────────────────────────────
  if (!isFirstMessage) {
    const greetingPatterns = /^(hello|hi|hey|welcome|good morning|good afternoon|good evening|greetings)/i;
    if (greetingPatterns.test(response.trim())) {
      score -= 20;
      issues.push({
        type: 'greeting_error',
        severity: 'high',
        detail: 'Re-greeting in a follow-up message',
      });
      improvements.push('NEVER re-greet. Continue the conversation naturally.');
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // CHECK 3: Response Length
  // ─────────────────────────────────────────────────────────────────────────
  if (wordCount > 150) {
    score -= 15;
    issues.push({
      type: 'too_long',
      severity: 'medium',
      detail: `Response is ${wordCount} words (ideal: under 80)`,
    });
    improvements.push('Be more concise. Users prefer shorter, focused responses.');
  } else if (wordCount < 5 && !['yes', 'no', 'okay', 'sure', 'got it'].some(w => lowerResponse.includes(w))) {
    score -= 10;
    issues.push({
      type: 'too_short',
      severity: 'low',
      detail: 'Response may be too brief',
    });
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // CHECK 4: Empathy Check (for negative/frustrated users)
  // ─────────────────────────────────────────────────────────────────────────
  if (emotionalTone === 'frustrated' || emotionalTone === 'negative') {
    const empathyIndicators = ['understand', 'sorry', 'hear you', 'frustrating', 'help', 'fix', 'resolve', 'apologize'];
    const hasEmpathy = empathyIndicators.some(e => lowerResponse.includes(e));
    
    if (!hasEmpathy) {
      score -= 20;
      issues.push({
        type: 'empathy_missing',
        severity: 'high',
        detail: 'No empathy shown to frustrated/negative user',
      });
      improvements.push('Show empathy! Acknowledge their frustration before solving.');
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // CHECK 5: Repetition Check
  // ─────────────────────────────────────────────────────────────────────────
  if (history && history.length > 0) {
    const recentBotMessages = history
      .filter(m => m.sender === 'bot' || m.sender === 'assistant')
      .slice(-3)
      .map(m => m.message.toLowerCase());
    
    for (const prevMsg of recentBotMessages) {
      if (prevMsg && lowerResponse.length > 30) {
        // Check for significant overlap
        const overlap = calculateTextOverlap(lowerResponse, prevMsg);
        if (overlap > 0.6) {
          score -= 25;
          issues.push({
            type: 'repetitive',
            severity: 'high',
            detail: 'Response is too similar to a previous message',
          });
          improvements.push('Avoid repeating yourself. Vary your language.');
          break;
        }
      }
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // CHECK 6: Pushy Sales Detection
  // ─────────────────────────────────────────────────────────────────────────
  const pushyIndicators = [
    'don\'t miss out',
    'limited time',
    'act now',
    'you won\'t regret',
    'hurry',
    'last chance',
    'special offer just for you',
  ];
  const pushyCount = pushyIndicators.filter(p => lowerResponse.includes(p)).length;
  if (pushyCount >= 2) {
    score -= 15;
    issues.push({
      type: 'pushy',
      severity: 'medium',
      detail: 'Response sounds too sales-pushy',
    });
    improvements.push('Be helpful, not pushy. Guide, don\'t pressure.');
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // CALCULATE FINAL GRADE
  // ─────────────────────────────────────────────────────────────────────────
  score = Math.max(0, Math.min(100, score));
  
  const grade: 'A' | 'B' | 'C' | 'D' | 'F' = 
    score >= 90 ? 'A' :
    score >= 75 ? 'B' :
    score >= 60 ? 'C' :
    score >= 40 ? 'D' : 'F';
  
  return {
    score,
    grade,
    issues,
    improvements,
    passesThreshold: score >= 60,
  };
}

function calculateTextOverlap(text1: string, text2: string): number {
  const words1 = new Set(text1.split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(text2.split(/\s+/).filter(w => w.length > 3));
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  let overlap = 0;
  for (const word of words1) {
    if (words2.has(word)) overlap++;
  }
  
  return overlap / Math.min(words1.size, words2.size);
}

// ═══════════════════════════════════════════════════════════════════════════
// QUALITY IMPROVEMENT PROMPT
// ═══════════════════════════════════════════════════════════════════════════

export function buildQualityPrompt(): string {
  return `
# ✅ RESPONSE QUALITY STANDARDS

## S-TIER Response Checklist
Before responding, verify:

1. **Natural Language** ✓
   - Sound like a helpful human, not a chatbot
   - NO robotic phrases: "certainly", "I'd be happy to", "absolutely", "as per", "kindly"
   - Vary your language - don't repeat the same phrases

2. **Conciseness** ✓
   - Keep responses under 80 words unless more detail is needed
   - Get to the point quickly
   - One clear message per response

3. **Emotional Intelligence** ✓
   - Match the user's energy
   - Show empathy when they're frustrated
   - Be warm when they're positive
   - Stay calm when they're urgent

4. **Context Awareness** ✓
   - Remember what was said earlier
   - Never re-greet after the first message
   - Don't ask for information already provided
   - Reference previous context naturally

5. **No Repetition** ✓
   - Don't repeat yourself
   - Don't repeat confirmation details
   - One farewell is enough
   - One "anything else?" is enough

## Quality Phrases to USE:
- "Got it!", "Perfect.", "Great!", "Sounds good.", "All set."
- "Let me help with that.", "Here's what I found.", "Quick question—"
- "That works!", "Noted.", "On it."

## Phrases to NEVER USE:
- "Certainly!", "Absolutely!", "Of course!"
- "I'd be happy to help you with that"
- "Thank you for reaching out"
- "Is there anything else I can assist you with today?"
- "I apologize for any inconvenience"
- "Please do not hesitate to..."
`;
}

// ═══════════════════════════════════════════════════════════════════════════
// POST-RESPONSE QUALITY CHECK
// ═══════════════════════════════════════════════════════════════════════════

export function shouldRegenerateResponse(quality: ResponseQuality): boolean {
  // Regenerate if critical issues
  if (quality.grade === 'F') return true;
  if (quality.issues.some(i => i.type === 'greeting_error' && i.severity === 'high')) return true;
  if (quality.issues.some(i => i.type === 'repetitive' && i.severity === 'high')) return true;
  
  return false;
}

export function getQualityFeedback(quality: ResponseQuality): string {
  if (quality.grade === 'A') return '';
  
  return `
[QUALITY FEEDBACK - Score: ${quality.score}/100]
${quality.improvements.map(i => `• ${i}`).join('\n')}
`;
}
