// ═══════════════════════════════════════════════════════════════════════════
// MASTER PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════
// Composes all 7 layers into a single, cohesive master system prompt.
// Each block is independent and can be modified without affecting others.
// ═══════════════════════════════════════════════════════════════════════════

import type { ReceptionistIdentity } from './layer1-identity.ts';
import type { ConversationContext, ChatMessage } from './layer3-memory.ts';
import type { MessageAnalysis } from './layer4-intent.ts';

import { buildIdentityPrompt } from './layer1-identity.ts';
import { buildKnowledgePrompt } from './layer2-knowledge.ts';
import { buildMemoryPrompt, summarizeConversation, extractContextFromHistory } from './layer3-memory.ts';
import { buildIntentPrompt } from './layer4-intent.ts';
import { buildBookingPrompt } from './layer5-booking.ts';
import { buildSafetyPrompt } from './layer6-safety.ts';
import { buildFailurePreventionPrompt } from './layer7-failure.ts';

/**
 * Configuration for building the master prompt
 */
export interface PromptConfig {
  identity: ReceptionistIdentity;
  knowledgeBase: string;
  history: ChatMessage[];
  messageAnalysis: MessageAnalysis;
  isFirstMessage: boolean;
}

/**
 * Build the complete master system prompt from all 7 layers
 */
export function buildMasterSystemPrompt(config: PromptConfig): string {
  const { identity, knowledgeBase, history, messageAnalysis, isFirstMessage } = config;
  
  // Extract context from history
  const context = extractContextFromHistory(history);
  const summary = summarizeConversation(history);
  
  // Build greeting message
  const greetingMessage = identity.greetingMessage || 
    `Hello! Welcome to ${identity.businessName}. I'm ${identity.name}, and I'm here to help. What can I do for you today?`;

  // Compose all layers
  const sections = [
    // Header
    `# 📌 S-TIER HUMAN-LIKE AI RECEPTIONIST SYSTEM
# Version: 7-Layer Modular Architecture | Build: Production

---`,

    // Layer 1: Core Identity
    buildIdentityPrompt(identity),

    '---',

    // Layer 3: Memory & Session (before Layer 2 for context)
    buildMemoryPrompt(context, summary, isFirstMessage, greetingMessage),

    '---',

    // Layer 2: Knowledge & RAG
    buildKnowledgePrompt(knowledgeBase),

    '---',

    // Layer 4: Intent & Decision
    buildIntentPrompt(messageAnalysis),

    '---',

    // Layer 5: Booking Intelligence
    buildBookingPrompt(context),

    '---',

    // Layer 6: Safety & Quality
    buildSafetyPrompt(),

    '---',

    // Layer 7: Failure Prevention
    buildFailurePreventionPrompt(),

    '---',

    // Final directive
    `# 📌 FINAL DIRECTIVE

You are not just answering questions—you are creating a positive experience that makes customers feel valued and heard.

Every interaction should leave them thinking "Wow, that was easy and pleasant."

Be the receptionist you'd want to talk to: helpful, efficient, empathetic, and genuinely caring.

**Monitor yourself. Evaluate yourself. Improve continuously.**

**Now respond to the user naturally, following all 7 layers of training above.**`,
  ];

  return sections.join('\n\n');
}

/**
 * Calculate optimal model parameters based on message analysis
 */
export function getModelParameters(analysis: MessageAnalysis): {
  temperature: number;
  maxTokens: number;
} {
  // Acknowledgments need shorter, more deterministic responses
  if (analysis.isAcknowledgment) {
    return { temperature: 0.7, maxTokens: 150 };
  }

  // Corrections need precise, focused responses
  if (analysis.isCorrection) {
    return { temperature: 0.75, maxTokens: 200 };
  }

  // General queries get balanced parameters
  return { temperature: 0.85, maxTokens: 500 };
}
