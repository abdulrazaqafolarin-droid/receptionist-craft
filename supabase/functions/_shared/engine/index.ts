// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED ENGINE v2 - MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════
// 
// THE SINGLE SOURCE OF TRUTH for AI business operator logic.
// 
// This engine consolidates:
// - Intent detection (single detector)
// - Entity extraction (single extractor)
// - State management (single state object)
// - Governor enforcement (pre-LLM validation)
// - Personality engine (human-like responses)
// 
// USAGE:
// import { runEngine, loadState, saveState } from '../_shared/engine/index.ts';
// 
// const result = runEngine({ message, session_id, ... });
// // result.state - updated state
// // result.prompt_block - inject into system prompt
// // result.ui_hints - what UI components to show
// ═══════════════════════════════════════════════════════════════════════════

// Core pipeline
export { runEngine, loadState, saveState, createEmptyState } from './core.ts';

// Types
export type {
  // Core types
  TaskType,
  TaskStep,
  UserIntent,
  EmotionalTone,
  EngineState,
  
  // Entity types
  ServiceEntity,
  ProductItem,
  AppointmentEntity,
  CustomerEntity,
  TaskEntities,
  
  // Business types
  BusinessCapabilities,
  
  // IO types
  EngineInput,
  EngineResult,
  IntentResult,
  ExtractedEntities,
  RequirementCheck,
  UIHints,
  GovernorInstruction,
} from './types.ts';

// State utilities
export { serializeState, deserializeState } from './types.ts';

// Intent detection (for direct use if needed)
export { detectIntent } from './intent.ts';

// Entity extraction (for direct use if needed)
export { extractEntities, cleanInput } from './entities.ts';

// State management (for direct use if needed)
export { updateState, checkRequirements } from './state.ts';

// Governor (for direct use if needed)
export { 
  generateUIHints, 
  generateInstruction, 
  buildPromptBlock,
  checkIllegalState,
} from './governor.ts';

// Personality engine
export {
  detectSentiment,
  getRandomAck,
  buildPersonalityPrompt,
  polishResponse,
  ROBOTIC_PHRASES,
  NATURAL_ACKS,
} from './personality.ts';
