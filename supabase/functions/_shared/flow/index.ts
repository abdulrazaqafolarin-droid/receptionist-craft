// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED FLOW ENGINE - MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════

// Types
export * from './types.ts';

// State Management
export { StateManager } from './stateManager.ts';

// Flow Routing
export {
  routeIntent,
  detectTopicShift,
  getNextBookingStep,
  getNextOrderingStep,
  getStepQuestion,
  type IntentRouting,
} from './flowRouter.ts';

// Slot Extraction
export {
  extractSlots,
  mergeSlots,
  buildSlotSummary,
  type ExtractionResult,
} from './slotExtractor.ts';

// Memory Summarization
export {
  MemorySummarizer,
  type KeyFacts,
  type ConversationSummary,
} from './memorySummarizer.ts';
