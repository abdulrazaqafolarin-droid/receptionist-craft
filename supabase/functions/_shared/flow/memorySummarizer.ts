// ═══════════════════════════════════════════════════════════════════════════
// MEMORY SUMMARIZER - Long-term memory management
// ═══════════════════════════════════════════════════════════════════════════

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export interface KeyFacts {
  preferred_service?: string;
  last_booked_service?: string;
  last_ordered_product?: string;
  contact_method?: 'phone' | 'email' | 'whatsapp';
  timezone?: string;
  preferred_time?: string;
  customer_name?: string;
  total_bookings?: number;
  total_orders?: number;
  last_interaction?: string;
  notes?: string[];
}

export interface ConversationSummary {
  id: string;
  receptionist_id: string;
  session_id: string;
  user_fingerprint?: string;
  summary: string;
  key_facts: KeyFacts;
  last_updated: string;
}

export class MemorySummarizer {
  private supabase: SupabaseClient;

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.supabase = createClient(supabaseUrl, serviceRoleKey);
  }

  // Get relevant summaries for a session/fingerprint
  async getRelevantSummaries(
    receptionistId: string,
    sessionId: string,
    fingerprint?: string,
    maxSummaries: number = 3
  ): Promise<ConversationSummary[]> {
    let query = this.supabase
      .from('conversation_summaries')
      .select('*')
      .eq('receptionist_id', receptionistId)
      .order('last_updated', { ascending: false })
      .limit(maxSummaries);

    if (fingerprint) {
      query = query.or(`session_id.eq.${sessionId},user_fingerprint.eq.${fingerprint}`);
    } else {
      query = query.eq('session_id', sessionId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[MemorySummarizer] Error fetching summaries:', error);
      return [];
    }

    return data || [];
  }

  // Create or update summary for a session
  async saveSummary(
    receptionistId: string,
    sessionId: string,
    summary: string,
    keyFacts: KeyFacts,
    fingerprint?: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('conversation_summaries')
      .upsert({
        receptionist_id: receptionistId,
        session_id: sessionId,
        user_fingerprint: fingerprint || null,
        summary,
        key_facts: keyFacts,
        last_updated: new Date().toISOString(),
      }, {
        onConflict: 'receptionist_id,session_id',
      });

    if (error) {
      console.error('[MemorySummarizer] Error saving summary:', error);
    }
  }

  // Extract key facts from conversation history
  extractKeyFacts(history: any[], context: any): KeyFacts {
    const facts: KeyFacts = {};
    
    // Extract from context
    if (context.serviceMentioned) facts.preferred_service = context.serviceMentioned;
    if (context.customerName) facts.customer_name = context.customerName;
    if (context.customerEmail) facts.contact_method = 'email';
    if (context.customerPhone) facts.contact_method = 'phone';
    
    // Check for completed bookings
    const botMessages = history.filter(h => h.sender === 'bot').map(h => h.message.toLowerCase());
    const hasBooking = botMessages.some(m => /confirmed|booked|scheduled|appointment is set/i.test(m));
    const hasOrder = botMessages.some(m => /order confirmed|placed your order|purchase confirmed/i.test(m));
    
    if (hasBooking && context.serviceMentioned) {
      facts.last_booked_service = context.serviceMentioned;
      facts.total_bookings = (facts.total_bookings || 0) + 1;
    }
    
    if (hasOrder && context.productMentioned) {
      facts.last_ordered_product = context.productMentioned;
      facts.total_orders = (facts.total_orders || 0) + 1;
    }
    
    facts.last_interaction = new Date().toISOString();
    
    return facts;
  }

  // Generate summary text from history
  generateSummaryText(history: any[], context: any): string {
    const parts: string[] = [];
    
    // Focus on actionable info only
    if (context.serviceMentioned) parts.push(`Service: ${context.serviceMentioned}`);
    if (context.productMentioned) parts.push(`Product: ${context.productMentioned}`);
    if (context.dateMentioned) parts.push(`Preferred date: ${context.dateMentioned}`);
    if (context.timeMentioned) parts.push(`Preferred time: ${context.timeMentioned}`);
    if (context.customerName) parts.push(`Customer: ${context.customerName}`);
    if (context.customerPhone) parts.push(`Phone: ${context.customerPhone}`);
    if (context.customerEmail) parts.push(`Email: ${context.customerEmail}`);
    
    // Check outcome
    const botMessages = history.filter(h => h.sender === 'bot').map(h => h.message.toLowerCase());
    if (botMessages.some(m => /confirmed|booked|scheduled/i.test(m))) {
      parts.push('Outcome: Booking confirmed');
    } else if (botMessages.some(m => /order confirmed|placed/i.test(m))) {
      parts.push('Outcome: Order placed');
    } else if (botMessages.some(m => /thank you|have a great day|goodbye/i.test(m))) {
      parts.push('Outcome: Conversation ended naturally');
    }
    
    return parts.length > 0 ? parts.join('. ') : 'General inquiry.';
  }

  // Check if summarization should run
  shouldSummarize(
    history: any[],
    context: any,
    thresholdMessages: number = 20
  ): boolean {
    // Run on booking/order completion
    if (context.bookingConfirmed || context.orderConfirmed) return true;
    
    // Run on long conversations
    if (history.length >= thresholdMessages) return true;
    
    // Run on conversation end signals
    const lastUserMsg = history.filter(h => h.sender === 'user').slice(-1)[0]?.message?.toLowerCase() || '';
    if (/bye|goodbye|thanks|that's all|no more/i.test(lastUserMsg)) return true;
    
    return false;
  }

  // Build memory context for prompt
  buildMemoryContext(summaries: ConversationSummary[]): string {
    if (!summaries.length) return '';
    
    const parts: string[] = ['## Previous Interactions (Memory)'];
    
    for (const summary of summaries.slice(0, 3)) {
      parts.push(`- ${summary.summary}`);
      
      const facts = summary.key_facts;
      if (facts.preferred_service) parts.push(`  Preferred service: ${facts.preferred_service}`);
      if (facts.customer_name) parts.push(`  Known as: ${facts.customer_name}`);
      if (facts.last_booked_service) parts.push(`  Last booked: ${facts.last_booked_service}`);
      if (facts.last_ordered_product) parts.push(`  Last ordered: ${facts.last_ordered_product}`);
    }
    
    parts.push('\n**Memory Rules:**');
    parts.push('- Reference this info naturally if relevant');
    parts.push('- Do NOT ask for info already known (name, preferences)');
    parts.push('- Personalize greetings if customer name is known');
    
    return parts.join('\n');
  }
}
