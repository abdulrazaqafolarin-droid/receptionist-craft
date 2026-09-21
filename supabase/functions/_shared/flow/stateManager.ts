// ═══════════════════════════════════════════════════════════════════════════
// CONVERSATION STATE MANAGER
// Manages state persistence and retrieval for conversation flows
// ═══════════════════════════════════════════════════════════════════════════

import { 
  ConversationState, 
  FlowSlots, 
  ActiveTask,
  createEmptyState,
  createEmptyActiveTask,
  serializeActiveTask,
  deserializeActiveTask,
} from "./types.ts";

interface SupabaseClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        maybeSingle(): Promise<{ data: unknown; error: unknown }>;
      };
    };
    upsert(row: Record<string, unknown>, opts?: { onConflict?: string }): Promise<{ error: unknown }>;
    update(row: Record<string, unknown>): {
      eq(col: string, val: string): Promise<{ error: unknown }>;
    };
  }
}

export class StateManager {
  private supabase: SupabaseClient;
  
  constructor(supabaseClient: SupabaseClient) {
    this.supabase = supabaseClient;
  }

  // Alias for getState (for compatibility)
  async load(sessionId: string, receptionistId: string): Promise<ConversationState> {
    return this.getState(sessionId, receptionistId);
  }

  async getState(sessionId: string, receptionistId: string): Promise<ConversationState> {
    const { data, error } = await this.supabase
      .from('conversation_state')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (error) {
      console.error('[StateManager] Error fetching state:', error);
    }

    if (data) {
      const slots = (data.slots as FlowSlots) || {};
      
      // Deserialize active task from slots
      const activeTask = deserializeActiveTask(slots.activeTask);
      
      return {
        session_id: data.session_id,
        receptionist_id: data.receptionist_id,
        active_flow: data.active_flow,
        active_topic: data.active_topic,
        flow_step: data.flow_step,
        topic_confidence: data.topic_confidence || 0,
        slots: slots,
        greeting_sent: slots.greeting_sent || false,
        booking_confirmed: slots.booking_confirmed || false,
        order_confirmed: slots.order_confirmed || false,
        asked_if_need_more_help: slots.asked_if_need_more_help || false,
        services_shown: slots.services_shown || false,
        products_shown: slots.products_shown || false,
        last_message_at: data.last_message_at,
        active_task: activeTask,
        // Restore parked flow state (PARK MODE)
        parkedFlow: slots.parkedFlow ?? null,
        parkedStep: slots.parkedStep ?? null,
        parkedSlots: slots.parkedSlots ?? null,
      };
    }

    return createEmptyState(sessionId, receptionistId);
  }

  async saveState(state: ConversationState): Promise<void> {
    const slotsWithFlags = {
      ...state.slots,
      greeting_sent: state.greeting_sent,
      booking_confirmed: state.booking_confirmed,
      order_confirmed: state.order_confirmed,
      asked_if_need_more_help: state.asked_if_need_more_help,
      services_shown: state.services_shown,
      products_shown: state.products_shown,
      // Serialize active task into slots
      activeTask: serializeActiveTask(state.active_task),
      // Persist parked flow state (PARK MODE)
      parkedFlow: state.parkedFlow ?? null,
      parkedStep: state.parkedStep ?? null,
      parkedSlots: state.parkedSlots ?? null,
    };

    const { error } = await this.supabase
      .from('conversation_state')
      .upsert({
        session_id: state.session_id,
        receptionist_id: state.receptionist_id,
        active_flow: state.active_flow,
        active_topic: state.active_topic,
        flow_step: state.flow_step,
        topic_confidence: state.topic_confidence,
        slots: slotsWithFlags,
        last_message_at: new Date().toISOString(),
      }, {
        onConflict: 'session_id',
      });

    if (error) {
      console.error('[StateManager] Error saving state:', error);
    }
  }

  async updateSlots(sessionId: string, updates: Partial<FlowSlots>): Promise<void> {
    const { data: existing } = await this.supabase
      .from('conversation_state')
      .select('slots')
      .eq('session_id', sessionId)
      .maybeSingle();

    const currentSlots = (existing?.slots as FlowSlots) || {};
    const newSlots = { ...currentSlots, ...updates };

    await this.supabase
      .from('conversation_state')
      .update({ slots: newSlots, last_message_at: new Date().toISOString() })
      .eq('session_id', sessionId);
  }

  async updateActiveTask(sessionId: string, task: ActiveTask | null): Promise<void> {
    const { data: existing } = await this.supabase
      .from('conversation_state')
      .select('slots')
      .eq('session_id', sessionId)
      .maybeSingle();

    const currentSlots = (existing?.slots as FlowSlots) || {};
    const newSlots = { 
      ...currentSlots, 
      activeTask: serializeActiveTask(task) 
    };

    await this.supabase
      .from('conversation_state')
      .update({ slots: newSlots, last_message_at: new Date().toISOString() })
      .eq('session_id', sessionId);
  }

  async resetFlow(sessionId: string): Promise<void> {
    await this.supabase
      .from('conversation_state')
      .update({
        active_flow: null,
        flow_step: null,
        slots: {},
        last_message_at: new Date().toISOString(),
      })
      .eq('session_id', sessionId);
  }

  async markGreetingSent(sessionId: string): Promise<void> {
    const { data: existing } = await this.supabase
      .from('conversation_state')
      .select('slots')
      .eq('session_id', sessionId)
      .maybeSingle();

    const currentSlots = (existing?.slots as FlowSlots) || {};
    currentSlots.greeting_sent = true;

    await this.supabase
      .from('conversation_state')
      .update({ slots: currentSlots, last_message_at: new Date().toISOString() })
      .eq('session_id', sessionId);
  }
}
