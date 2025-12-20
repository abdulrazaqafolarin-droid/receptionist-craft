// ═══════════════════════════════════════════════════════════════════════════
// LAYER 6: QUALITY METRICS & EVALUATION
// ═══════════════════════════════════════════════════════════════════════════

import type { ConversationContext } from './context.ts';
import type { MessageAnalysis } from './intent.ts';

export interface QualityMetrics {
  overall_quality: number;
  relevance: number;
  empathy: number;
  clarity: number;
  factuality: number;
  naturalness: number;
  passes_threshold: boolean;
  issues: string[];
}

export interface ConversationKPIs {
  is_engaged: boolean;
  repetition_rate: number;
  hallucination_risk: number;
  goal_completion_likely: boolean;
  user_said_thanks: boolean;
  user_expressed_frustration: boolean;
  avg_response_length: number;
  turn_count: number;
}

export interface EscalationCheck {
  shouldEscalate: boolean;
  reason?: string;
  escalationType?: 'human_request' | 'frustration' | 'repeated_failure' | 'safety';
}

const ROBOTIC_PHRASES = [
  'acknowledged', 'affirmative', 'negative', 'noted',
  'as per your request', 'kindly', 'hereby', 'therein',
  'as an ai', 'i am a bot', 'i am programmed',
];

export function computeQualityMetrics(
  userMessage: string,
  botReply: string,
  context: ConversationContext,
  messageAnalysis: MessageAnalysis,
  history?: any[]
): QualityMetrics {
  const issues: string[] = [];
  let totalScore = 0;
  const weights = { relevance: 0.25, empathy: 0.2, clarity: 0.2, factuality: 0.2, naturalness: 0.15 };
  
  // Relevance: Does the reply address the user's message?
  const relevanceScore = calculateRelevance(userMessage, botReply, messageAnalysis);
  totalScore += relevanceScore * weights.relevance;
  if (relevanceScore < 0.5) issues.push('Low relevance to user message');
  
  // Empathy: Does the reply show appropriate emotional awareness?
  const empathyScore = calculateEmpathy(botReply, context.emotionalState);
  totalScore += empathyScore * weights.empathy;
  if (empathyScore < 0.5 && context.emotionalState !== 'neutral') {
    issues.push('Insufficient empathy for user emotional state');
  }
  
  // Clarity: Is the reply clear and easy to understand?
  const clarityScore = calculateClarity(botReply);
  totalScore += clarityScore * weights.clarity;
  if (clarityScore < 0.5) issues.push('Response may be unclear');
  
  // Factuality: Is the reply grounded (not hallucinating)?
  const factualityScore = calculateFactuality(botReply, messageAnalysis);
  totalScore += factualityScore * weights.factuality;
  if (factualityScore < 0.5) issues.push('Potential hallucination risk');
  
  // Naturalness: Does it sound human?
  const naturalnessScore = calculateNaturalness(botReply, history);
  totalScore += naturalnessScore * weights.naturalness;
  if (naturalnessScore < 0.5) issues.push('Response sounds robotic');
  
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

function calculateRelevance(userMessage: string, botReply: string, analysis: MessageAnalysis): number {
  const userWords = new Set(userMessage.toLowerCase().split(/\s+/));
  const replyWords = new Set(botReply.toLowerCase().split(/\s+/));
  
  // Check for keyword overlap
  let overlap = 0;
  for (const word of userWords) {
    if (word.length > 3 && replyWords.has(word)) overlap++;
  }
  
  const overlapScore = Math.min(1, overlap / Math.max(1, userWords.size) * 2);
  
  // Acknowledgments should be short
  if (analysis.isAcknowledgment) {
    const wordCount = botReply.split(/\s+/).length;
    return wordCount <= 30 ? 1 : 0.5;
  }
  
  // Questions should be answered
  if (userMessage.includes('?')) {
    const hasAnswer = /\?|because|is|are|will|can|would/i.test(botReply);
    return hasAnswer ? 0.8 + overlapScore * 0.2 : 0.4;
  }
  
  return 0.6 + overlapScore * 0.4;
}

function calculateEmpathy(botReply: string, emotionalState: string): number {
  const empathyPhrases = [
    'understand', 'sorry', 'apologize', 'appreciate', 'help',
    'happy to', 'glad to', 'of course', 'absolutely', 'no problem',
    'i hear you', 'that makes sense', 'completely understand'
  ];
  
  const hasEmpathy = empathyPhrases.some(p => botReply.toLowerCase().includes(p));
  
  if (emotionalState === 'frustrated' || emotionalState === 'negative') {
    return hasEmpathy ? 0.9 : 0.3;
  }
  if (emotionalState === 'positive') {
    return 0.9; // Being positive back is good
  }
  
  return hasEmpathy ? 0.9 : 0.7; // Neutral state doesn't require strong empathy
}

function calculateClarity(botReply: string): number {
  const sentences = botReply.split(/[.!?]+/).filter(s => s.trim());
  const avgSentenceLength = botReply.split(/\s+/).length / Math.max(1, sentences.length);
  
  // Ideal sentence length is 10-25 words
  let score = 1;
  if (avgSentenceLength > 35) score -= 0.3;
  if (avgSentenceLength < 5) score -= 0.2;
  
  // Check for jargon or overly complex language
  const complexWords = botReply.match(/\b\w{12,}\b/g) || [];
  if (complexWords.length > 3) score -= 0.2;
  
  return Math.max(0.3, score);
}

function calculateFactuality(botReply: string, analysis: MessageAnalysis): number {
  // Check for hedging language (good for uncertain topics)
  const hedging = /might|could|possibly|perhaps|i believe|i think/i.test(botReply);
  
  // Check for definitive claims about things we might not know
  const definiteClaims = /definitely|certainly|always|never|guaranteed/i.test(botReply);
  
  if (analysis.hasUncertainty && !hedging) {
    return 0.5; // Should hedge when uncertain
  }
  
  if (definiteClaims && !analysis.detectedIntent.includes('confirm')) {
    return 0.7; // Overly definitive
  }
  
  return 0.9;
}

function calculateNaturalness(botReply: string, history?: any[]): number {
  let score = 1;
  const lowerReply = botReply.toLowerCase();
  
  // Check for robotic phrases
  for (const phrase of ROBOTIC_PHRASES) {
    if (lowerReply.includes(phrase)) {
      score -= 0.2;
    }
  }
  
  // Check for repetition in history
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
  
  // Check for unnecessary greetings in follow-up
  if (history && history.length > 2 && /^(hello|hi|hey|welcome)/i.test(botReply)) {
    score -= 0.3;
  }
  
  return Math.max(0.2, score);
}

export function computeConversationKPIs(history: any[], context: ConversationContext): ConversationKPIs {
  const botMessages = history.filter((m: any) => m.sender === 'bot');
  const userMessages = history.filter((m: any) => m.sender === 'user');
  
  // Calculate repetition rate
  const botTexts = botMessages.map((m: any) => m.message?.toLowerCase().slice(0, 50) || '');
  const uniqueTexts = new Set(botTexts);
  const repetition_rate = botTexts.length > 0 ? 1 - (uniqueTexts.size / botTexts.length) : 0;
  
  // Check for user frustration
  const user_expressed_frustration = userMessages.some((m: any) => 
    /frustrated|angry|upset|annoyed|terrible|awful|worst/i.test(m.message || '')
  );
  
  // Check for thanks
  const user_said_thanks = userMessages.some((m: any) => 
    /thank|thanks|appreciate/i.test(m.message || '')
  );
  
  // Calculate engagement (short back-and-forth = engaged)
  const is_engaged = history.length >= 4 && repetition_rate < 0.3;
  
  // Estimate goal completion
  const goal_completion_likely = 
    context.serviceMentioned !== null || 
    context.conversationPhase === 'confirmation' ||
    user_said_thanks;
  
  // Average response length
  const totalBotWords = botMessages.reduce((sum: number, m: any) => 
    sum + (m.message?.split(/\s+/).length || 0), 0
  );
  const avg_response_length = botMessages.length > 0 ? totalBotWords / botMessages.length : 0;
  
  return {
    is_engaged,
    repetition_rate: Math.round(repetition_rate * 100) / 100,
    hallucination_risk: context.urgencyLevel === 'critical' ? 0.3 : 0.1,
    goal_completion_likely,
    user_said_thanks,
    user_expressed_frustration,
    avg_response_length: Math.round(avg_response_length),
    turn_count: history.length,
  };
}

export function checkEscalationNeeded(
  message: string,
  context: ConversationContext,
  history: any[]
): EscalationCheck {
  // Explicit human request
  if (/speak to (a |someone|human|person|manager)|talk to someone|real person/i.test(message)) {
    return {
      shouldEscalate: true,
      reason: 'User explicitly requested human assistance',
      escalationType: 'human_request',
    };
  }
  
  // Frustration detected
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
  
  // Repeated similar questions (possible loop)
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
