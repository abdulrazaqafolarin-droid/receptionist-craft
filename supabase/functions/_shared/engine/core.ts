// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED ENGINE v2 - CORE PIPELINE
// ═══════════════════════════════════════════════════════════════════════════
// 
// THE MAIN ENTRY POINT. Executes the full pipeline:
// Input → Clean → Detect Intent → Extract Entities → Update State → Govern → Output
// 
// This is the ONLY function that should be called from widget-chat.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  EngineInput,
  EngineResult,
  EngineState,
  createEmptyState as createEmptyStateType,
} from './types.ts';
import { createEmptyState } from './types.ts';
import { detectIntent } from './intent.ts';
import { extractEntities, cleanInput } from './entities.ts';
import { updateState, checkRequirements } from './state.ts';
import { generateUIHints, generateInstruction, buildPromptBlock, checkIllegalState } from './governor.ts';

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PIPELINE FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function runEngine(input: EngineInput): EngineResult {
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 0: Initialize state if needed
  // ─────────────────────────────────────────────────────────────────────────
  const currentState = input.current_state || createEmptyState();
  
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1: Clean input
  // ─────────────────────────────────────────────────────────────────────────
  const cleanedMessage = cleanInput(input.message);
  
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2: Detect intent
  // ─────────────────────────────────────────────────────────────────────────
  const intent = detectIntent(
    cleanedMessage,
    currentState,
    {
      can_book: input.capabilities.can_book,
      can_order: input.capabilities.can_order,
      can_deliver: input.capabilities.can_deliver,
      primary_goal: input.capabilities.primary_goal,
    },
    input.is_first_message
  );
  
  console.log('[Engine] Intent detected:', intent.intent, 'confidence:', intent.confidence);
  
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3: Extract entities
  // ─────────────────────────────────────────────────────────────────────────
  const entities = extractEntities(
    cleanedMessage,
    input.services,
    input.products
  );
  
  console.log('[Engine] Entities extracted:', Object.keys(entities).filter(k => (entities as any)[k]));
  
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 4: Update state
  // ─────────────────────────────────────────────────────────────────────────
  const newState = updateState(currentState, intent, entities, input.timezone);
  
  console.log('[Engine] State updated. Task:', newState.task_type, 'Step:', newState.task_step);
  
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 5: Check requirements
  // ─────────────────────────────────────────────────────────────────────────
  const requirements = checkRequirements(newState);
  
  console.log('[Engine] Requirements. Missing:', requirements.missing, 'Next:', requirements.next_required);
  
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 6: Generate UI hints
  // ─────────────────────────────────────────────────────────────────────────
  const uiHints = generateUIHints(newState);
  
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 7: Generate governor instruction
  // ─────────────────────────────────────────────────────────────────────────
  const instruction = generateInstruction(newState, requirements, intent);
  
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 8: Build prompt block
  // ─────────────────────────────────────────────────────────────────────────
  const promptBlock = buildPromptBlock(newState, requirements, instruction);
  
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 9: Check for illegal state
  // ─────────────────────────────────────────────────────────────────────────
  const illegalCheck = checkIllegalState(newState, instruction);
  
  // ─────────────────────────────────────────────────────────────────────────
  // RETURN RESULT
  // ─────────────────────────────────────────────────────────────────────────
  return {
    state: newState,
    intent,
    entities,
    requirements,
    ui_hints: uiHints,
    instruction,
    prompt_block: promptBlock,
    illegal: illegalCheck.illegal,
    illegal_reason: illegalCheck.reason,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE PERSISTENCE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export async function loadState(
  supabase: any,
  sessionId: string,
  receptionistId: string
): Promise<EngineState> {
  const { data, error } = await supabase
    .from('conversation_state')
    .select('slots')
    .eq('session_id', sessionId)
    .maybeSingle();
  
  if (error) {
    console.error('[Engine] Error loading state:', error);
    return createEmptyState();
  }
  
  if (data?.slots?.engineState) {
    try {
      return JSON.parse(data.slots.engineState) as EngineState;
    } catch {
      return createEmptyState();
    }
  }
  
  return createEmptyState();
}

export async function saveState(
  supabase: any,
  sessionId: string,
  receptionistId: string,
  state: EngineState
): Promise<void> {
  const { error } = await supabase
    .from('conversation_state')
    .upsert({
      session_id: sessionId,
      receptionist_id: receptionistId,
      slots: { engineState: JSON.stringify(state) },
      last_message_at: new Date().toISOString(),
    }, {
      onConflict: 'session_id',
    });
  
  if (error) {
    console.error('[Engine] Error saving state:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RE-EXPORTS FOR CONVENIENCE
// ═══════════════════════════════════════════════════════════════════════════

export { createEmptyState } from './types.ts';
export type { EngineState, EngineInput, EngineResult } from './types.ts';
