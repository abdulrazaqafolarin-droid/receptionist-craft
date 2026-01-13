// ═══════════════════════════════════════════════════════════════════════════
// CONVERSATION STATE MANAGER
// Manages state persistence and retrieval for conversation flows
// ═══════════════════════════════════════════════════════════════════════════

import { ConversationState, FlowSlots, createEmptyState } from "./types.ts";

export class StateManager {
  private supabase: any;
  
  constructor(supabaseClient: any) {
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
      return {
        session_id: data.session_id,
        receptionist_id: data.receptionist_id,
        active_flow: data.active_flow,
        active_topic: data.active_topic,
        flow_step: data.flow_step,
        topic_confidence: data.topic_confidence || 0,
        slots: (data.slots as FlowSlots) || {},
        greeting_sent: (data.slots as any)?.greeting_sent || false,
        booking_confirmed: (data.slots as any)?.booking_confirmed || false,
        order_confirmed: (data.slots as any)?.order_confirmed || false,
        asked_if_need_more_help: (data.slots as any)?.asked_if_need_more_help || false,
        services_shown: (data.slots as any)?.services_shown || false,
        products_shown: (data.slots as any)?.products_shown || false,
        last_message_at: data.last_message_at,
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

    const currentSlots = (existing?.slots || {}) as any;
    currentSlots.greeting_sent = true;

    await this.supabase
      .from('conversation_state')
      .update({ slots: currentSlots, last_message_at: new Date().toISOString() })
      .eq('session_id', sessionId);
  }
}
