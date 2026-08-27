/**
 * Module 20: Analytics / Reporting Digest
 *
 * Compiles a periodic performance summary from the business's own
 * FrontDesk data and delivers it automatically. The compiling itself
 * is Tier 1 achievable from existing data — delivery inherits tier
 * from whichever outbound channel is connected (email/SMS).
 *
 * Tier: 1 (compilation), delivery depends on channel connectors
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface DigestReport {
  period: string;              // "Last 7 days" / "Last 30 days"
  generated_at: string;

  // Core metrics
  total_conversations: number;
  new_leads: number;
  bookings_made: number;
  orders_placed: number;
  revenue_collected: number;
  currency: string;

  // AI performance
  avg_confidence: number;
  escalation_rate: number;
  response_quality: string;    // "excellent" / "good" / "needs_improvement"

  // Customer insights
  returning_customer_rate: number;
  top_intents: Array<{ intent: string; count: number }>;
  peak_hours: Array<{ hour: number; count: number }>;

  // Conversion funnel
  conversation_to_booking_rate: number;
  conversation_to_order_rate: number;

  // Issues
  low_confidence_count: number;
  unanswered_count: number;
  recent_escalations: number;

  // Recommendations
  recommendations: string[];
}

/**
 * Generate an analytics digest for a given time period.
 */
export async function generateDigest(
  supabase: SupabaseClient,
  receptionistId: string,
  days: number = 7,
): Promise<DigestReport> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const period = days <= 7 ? "Last 7 days" : days <= 30 ? "Last 30 days" : `Last ${days} days`;

  // Parallel queries for performance
  const [
    conversationsRes,
    appointmentsRes,
    ordersRes,
    paymentsRes,
    responsesRes,
    escalationsRes,
    eventsRes,
  ] = await Promise.all([
    // Conversations
    supabase
      .from("chat_messages")
      .select("session_id, sender, created_at")
      .eq("receptionist_id", receptionistId)
      .gte("created_at", since),

    // Appointments
    supabase
      .from("appointments")
      .select("id, status, created_at")
      .eq("receptionist_id", receptionistId)
      .gte("created_at", since),

    // Orders
    supabase
      .from("orders")
      .select("id, status, total_amount, created_at")
      .eq("receptionist_id", receptionistId)
      .gte("created_at", since),

    // Payments
    supabase
      .from("payments")
      .select("amount, currency, status")
      .eq("receptionist_id", receptionistId)
      .gte("created_at", since)
      .eq("status", "completed"),

    // AI responses quality
    supabase
      .from("ai_responses")
      .select("confidence, quality_score, flagged, tags")
      .eq("receptionist_id", receptionistId)
      .gte("created_at", since),

    // Escalations
    supabase
      .from("escalations")
      .select("id, created_at")
      .eq("receptionist_id", receptionistId)
      .gte("created_at", since),

    // Conversion events
    supabase
      .from("conversion_events")
      .select("event_type, metadata")
      .eq("receptionist_id", receptionistId)
      .gte("created_at", since),
  ]);

  // Process data
  const messages = conversationsRes.data || [];
  const userMessages = messages.filter((m) => m.sender === "user");
  const uniqueSessions = new Set(userMessages.map((m) => m.session_id));

  const appointments = appointmentsRes.data || [];
  const orders = ordersRes.data || [];
  const payments = paymentsRes.data || [];
  const responses = responsesRes.data || [];
  const escalations = escalationsRes.data || [];
  const events = eventsRes.data || [];

  // Revenue
  const totalRevenue = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const currency = payments[0]?.currency || "USD";

  // AI quality
  const avgConfidence =
    responses.length > 0
      ? responses.reduce((sum, r) => sum + (r.confidence || 0), 0) / responses.length
      : 0;

  const flaggedCount = responses.filter((r) => r.flagged).length;
  const escalationRate =
    userMessages.length > 0 ? escalations.length / userMessages.length : 0;

  // Intent distribution
  const intentCounts = new Map<string, number>();
  events.forEach((e) => {
    if (e.metadata?.intent) {
      intentCounts.set(e.metadata.intent, (intentCounts.get(e.metadata.intent) || 0) + 1);
    }
  });
  const topIntents = Array.from(intentCounts.entries())
    .map(([intent, count]) => ({ intent, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Peak hours
  const hourCounts = new Map<number, number>();
  userMessages.forEach((m) => {
    const hour = new Date(m.created_at).getHours();
    hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
  });
  const peakHours = Array.from(hourCounts.entries())
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  // Conversion rates
  const bookingRate =
    uniqueSessions.size > 0 ? appointments.length / uniqueSessions.size : 0;
  const orderRate =
    uniqueSessions.size > 0 ? orders.length / uniqueSessions.size : 0;

  // Returning customers
  const returningSessions = events.filter(
    (e) => e.event_type === "returning_customer",
  ).length;
  const returningRate =
    uniqueSessions.size > 0 ? returningSessions / uniqueSessions.size : 0;

  // Recommendations
  const recommendations = generateRecommendations({
    avgConfidence,
    escalationRate,
    flaggedCount,
    bookingRate,
    orderRate,
    returningRate,
    peakHours,
    topIntents,
  });

  return {
    period,
    generated_at: new Date().toISOString(),
    total_conversations: uniqueSessions.size,
    new_leads: events.filter((e) => e.event_type === "lead_captured").length,
    bookings_made: appointments.length,
    orders_placed: orders.length,
    revenue_collected: totalRevenue,
    currency,
    avg_confidence: avgConfidence,
    escalation_rate: escalationRate,
    response_quality:
      avgConfidence >= 0.8 ? "excellent" : avgConfidence >= 0.6 ? "good" : "needs_improvement",
    returning_customer_rate: returningRate,
    top_intents: topIntents,
    peak_hours: peakHours,
    conversation_to_booking_rate: bookingRate,
    conversation_to_order_rate: orderRate,
    low_confidence_count: flaggedCount,
    unanswered_count: responses.filter((r) => r.quality_score?.unanswered).length,
    recent_escalations: escalations.length,
    recommendations,
  };
}

function generateRecommendations(data: {
  avgConfidence: number;
  escalationRate: number;
  flaggedCount: number;
  bookingRate: number;
  orderRate: number;
  returningRate: number;
  peakHours: Array<{ hour: number; count: number }>;
  topIntents: Array<{ intent: string; count: number }>;
}): string[] {
  const recs: string[] = [];

  if (data.avgConfidence < 0.6) {
    recs.push("Your AI response quality is below 60% confidence. Consider updating your knowledge base with more accurate information.");
  }
  if (data.escalationRate > 0.2) {
    recs.push("Over 20% of conversations are being escalated. Review common escalation reasons and add answers to your FAQ.");
  }
  if (data.bookingRate < 0.1 && data.topIntents.some((i) => i.intent === "book_appointment")) {
    recs.push("Many conversations involve booking interest but few convert to actual bookings. Simplify your booking flow.");
  }
  if (data.returningRate > 0.3) {
    recs.push("Great — over 30% of your conversations are from returning customers. Consider a loyalty or referral program.");
  }
  if (data.peakHours.length > 0) {
    const peak = data.peakHours[0];
    recs.push(`Your busiest hour is ${peak.hour}:00 with ${peak.count} conversations. Consider staffing or response priorities for this time.`);
  }

  if (recs.length === 0) {
    recs.push("Your AI is performing well. Keep your knowledge base up to date for best results.");
  }

  return recs;
}
