// ═══════════════════════════════════════════════════════════════════════════
// 7-LAYER S-TIER CONVERSATIONAL AI ARCHITECTURE
// ═══════════════════════════════════════════════════════════════════════════
// 
// AI Receptionist System
// │
// ├── Layer 1: Core Identity & Mission
// │
// ├── Layer 2: Knowledge & Grounding (RAG)
// │
// ├── Layer 3: Memory & Context Engine
// │
// ├── Layer 4: Intent & Decision Engine
// │
// ├── Layer 5: Execution (Booking / Actions)
// │
// ├── Layer 6: Safety, Quality & Guardrails
// │
// └── Layer 7: Failure Prevention & Escalation
//
// Each layer is independent, composable, testable, and cannot leak
// responsibility into another layer.
// ═══════════════════════════════════════════════════════════════════════════

// Layer 1: Core Identity
export {
  buildIdentityPrompt,
  IDENTITY_INVARIANTS,
  type ReceptionistIdentity,
} from './layer1-identity.ts';

// Layer 2: Knowledge & RAG
export {
  buildKnowledgeBase,
  buildKnowledgePrompt,
  CONFIDENCE_LEVELS,
  type BusinessInfo,
  type FAQ,
  type Service,
} from './layer2-knowledge.ts';

// Layer 3: Memory & Context
export {
  createEmptyContext,
  extractContextFromHistory,
  summarizeConversation,
  generateRollingSummary,
  buildMemoryPrompt,
  type ConversationContext,
  type ChatMessage,
} from './layer3-memory.ts';

// Layer 4: Intent & Decision
export {
  detectIntent,
  analyzeMessage,
  determineDialogAct,
  buildIntentPrompt,
  type IntentType,
  type DialogAct,
  type MessageAnalysis,
} from './layer4-intent.ts';

// Layer 5: Booking/Execution
export {
  checkBookingRequirements,
  determineBookingState,
  getNextBookingQuestion,
  buildBookingSummary,
  buildBookingPrompt,
  type BookingState,
  type BookingRequirements,
} from './layer5-booking.ts';

// Layer 6: Safety & Quality
export {
  runSafetyClassifier,
  getSafetyResponse,
  evaluateResponseQuality,
  buildSafetyPrompt,
  SAFETY_PATTERNS,
  ROBOTIC_PHRASES,
  NATURAL_ACKS,
  REPAIR_PHRASES,
  type SafetyResult,
  type QualityRubric,
} from './layer6-safety.ts';

// Layer 7: Failure Prevention
export {
  checkUncertainty,
  checkEscalationNeeded,
  validateResponseQuality,
  buildFailurePreventionPrompt,
  type EscalationDecision,
  type UncertaintyCheck,
  type QualityValidation,
} from './layer7-failure.ts';
