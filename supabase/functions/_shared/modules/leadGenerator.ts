/**
 * Module 1: Lead Generator
 *
 * Monitors inbound interest from existing conversation data and qualifies
 * leads against owner-configured criteria. Fully autonomous — uses only
 * data already in the platform (chat_messages, conversion_events, etc.).
 *
 * Tier: 1 (fully autonomous)
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface Lead {
  id: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  source: string;              // Which conversation/session generated this lead
  intent: string;              // What they expressed interest in
  score: number;               // 1-10 qualification score
  qualified: boolean;          // Meets owner's criteria
  status: "new" | "contacted" | "converted" | "disqualified";
  captured_at: string;
}

export interface LeadCriteria {
  min_score: number;           // Minimum score to qualify
  intents: string[];           // Which intents count as leads
  min_messages: number;        // Minimum conversation depth
  requires_contact: boolean;   // Must have phone or email
}

const DEFAULT_CRITERIA: LeadCriteria = {
  min_score: 5,
  intents: ["book_appointment", "order_product", "ask_price", "ask_info"],
  min_messages: 2,
  requires_contact: true,
};

/**
 * Scan recent conversations and extract qualified leads.
 */
export async function extractLeads(
  supabase: SupabaseClient,
  receptionistId: string,
  criteria: LeadCriteria = DEFAULT_CRITERIA,
): Promise<Lead[]> {
  // Get recent conversations that haven't been tracked as leads
  const { data: recentConversations } = await supabase
    .from("chat_messages")
    .select("session_id, sender, message, created_at")
    .eq("receptionist_id", receptionistId)
    .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false });

  if (!recentConversations || recentConversations.length === 0) return [];

  // Group by session_id
  const sessions = new Map<string, typeof recentConversations>();
  recentConversations.forEach((msg) => {
    const existing = sessions.get(msg.session_id) || [];
    existing.push(msg);
    sessions.set(msg.session_id, existing);
  });

  const leads: Lead[] = [];

  for (const [sessionId, messages] of sessions) {
    const userMessages = messages.filter((m) => m.sender === "user");
    if (userMessages.length < criteria.min_messages) continue;

    // Check if already tracked as a lead
    const { data: existingLead } = await supabase
      .from("conversion_events")
      .select("id")
      .eq("receptionist_id", receptionistId)
      .eq("session_id", sessionId)
      .eq("event_type", "lead_captured")
      .maybeSingle();

    if (existingLead) continue;

    // Score the lead based on conversation content
    const allText = userMessages.map((m) => m.message).join(" ").toLowerCase();
    const score = scoreLead(allText, userMessages.length, criteria);

    if (score < criteria.min_score) continue;

    // Try to extract contact info
    const phoneMatch = allText.match(/(\+?\d{10,14}|\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/);
    const emailMatch = allText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    const nameMatch = allText.match(/(?:my name is|i'm|i am)\s+([a-zA-Z]{2,})/i);

    const hasContact =
      !criteria.requires_contact || phoneMatch || emailMatch;

    if (!hasContact) continue;

    // Detect intent from messages
    const intents = detectLeadIntents(allText);

    const lead: Lead = {
      id: `lead_${sessionId}`,
      customer_id: null,
      customer_name: nameMatch?.[1] || "Unknown",
      customer_phone: phoneMatch?.[0] || null,
      customer_email: emailMatch?.[0] || null,
      source: `session:${sessionId}`,
      intent: intents[0] || "general_inquiry",
      score,
      qualified: score >= criteria.min_score,
      status: "new",
      captured_at: messages[0]?.created_at || new Date().toISOString(),
    };

    leads.push(lead);

    // Track as conversion event
    await supabase.from("conversion_events").insert({
      receptionist_id: receptionistId,
      session_id: sessionId,
      event_type: "lead_captured",
      revenue_value: 0,
      currency: "USD",
      metadata: {
        customer_name: lead.customer_name,
        score: lead.score,
        intent: lead.intent,
        qualified: lead.qualified,
      },
    });
  }

  return leads;
}

/**
 * Get all leads for a receptionist.
 */
export async function getLeads(
  supabase: SupabaseClient,
  receptionistId: string,
): Promise<Lead[]> {
  const { data } = await supabase
    .from("conversion_events")
    .select("*")
    .eq("receptionist_id", receptionistId)
    .eq("event_type", "lead_captured")
    .order("created_at", { ascending: false });

  return (data || []).map((e) => ({
    id: e.id,
    customer_id: null,
    customer_name: e.metadata?.customer_name || "Unknown",
    customer_phone: null,
    customer_email: null,
    source: e.session_id,
    intent: e.metadata?.intent || "general_inquiry",
    score: e.metadata?.score || 0,
    qualified: e.metadata?.qualified || false,
    status: "new",
    captured_at: e.created_at,
  }));
}

// ── Helpers ────────────────────────────────────────────────────────

function scoreLead(
  text: string,
  messageCount: number,
  criteria: LeadCriteria,
): number {
  let score = 0;

  // Intent signals
  if (/book|appointment|schedule|reserve/i.test(text)) score += 3;
  if (/buy|purchase|order|price|cost|how much/i.test(text)) score += 3;
  if (/quote|estimate|proposal/i.test(text)) score += 2;
  if (/sign up|register|join|subscribe/i.test(text)) score += 2;

  // Engagement signals
  if (messageCount >= 5) score += 1;
  if (messageCount >= 10) score += 1;

  // Contact signals (they shared info)
  if (/\+?\d{10,}/.test(text)) score += 1;
  if (/@/.test(text)) score += 1;

  // Urgency signals
  if (/urgent|asap|immediately|today|now/i.test(text)) score += 1;

  return Math.min(10, score);
}

function detectLeadIntents(text: string): string[] {
  const intents: string[] = [];

  if (/book|appointment|schedule|reserve/i.test(text)) intents.push("booking");
  if (/buy|purchase|order/i.test(text)) intents.push("purchase");
  if (/price|cost|how much|quote/i.test(text)) intents.push("pricing");
  if (/sign up|register|join|membership/i.test(text)) intents.push("signup");
  if (/info|tell me|what|how/i.test(text)) intents.push("information");

  return intents.length > 0 ? intents : ["general_inquiry"];
}
