import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface MEOInsight {
  id: string;
  type: "revenue_leak" | "capacity_waste" | "channel_decay" | "growth_pattern" | "risk" | "opportunity";
  title: string;
  description: string;
  metric_value: string;
  metric_trend: "up" | "down" | "stable";
  confidence: number;
  urgency: "low" | "medium" | "high" | "critical";
  suggested_action: string;
  action_type: "autonomous" | "suggest" | "alert";
  dismissible: boolean;
  created_at: string;
  amount?: number;
}

interface MEOResponse {
  insights: MEOInsight[];
  summary: {
    total_leaked: number;
    total_opportunity: number;
    active_alerts: number;
    conversion_rate: number;
    avg_booking_value: number;
  };
  funnel: {
    stage: string;
    value: number;
    pct: number;
    dropoff_reason?: string;
  }[];
  intent_distribution: { intent: string; count: number; avg_score: number; conversion_rate: number }[];
  heatmap: { hour: number; day: number; conversations: number; revenue: number }[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonRes({ error: "Missing Authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return jsonRes({ error: "Invalid token" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const { receptionist_ids, days = 30, scope = "all" } = body;

    // Get user's receptionists
    let receptionistQuery = supabase.from("receptionists").select("id").eq("user_id", user.id);
    
    if (receptionist_ids && receptionist_ids.length > 0) {
      receptionistQuery = receptionistQuery.in("id", receptionist_ids);
    }
    
    const { data: userReceptionists, error: recError } = await receptionistQuery;
    if (recError) throw recError;
    
    const receptionistIds = userReceptionists?.map(r => r.id) || [];
    
    if (receptionistIds.length === 0) {
      return jsonRes({ 
        insights: [], 
        summary: { total_leaked: 0, total_opportunity: 0, active_alerts: 0, conversion_rate: 0, avg_booking_value: 0 },
        funnel: [],
        intent_distribution: [],
        heatmap: []
      });
    }

    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceISO = since.toISOString();

    // Fetch all relevant data in parallel
    const [
      { data: events, error: eventsError },
      { data: conversations, error: convError },
      { data: aiResponses, error: aiError },
      { data: appointments, error: apptError },
      { data: orders, error: ordersError },
    ] = await Promise.all([
      supabase.from("conversion_events").select("*").in("receptionist_id", receptionistIds).gte("created_at", sinceISO),
      supabase.from("conversations").select("*").in("receptionist_id", receptionistIds).gte("created_at", sinceISO),
      supabase.from("ai_responses").select("*").in("receptionist_id", receptionistIds).gte("created_at", sinceISO),
      supabase.from("appointments").select("*").in("receptionist_id", receptionistIds).gte("created_at", sinceISO),
      supabase.from("orders").select("*").in("receptionist_id", receptionistIds).gte("created_at", sinceISO),
    ]);

    if (eventsError) throw eventsError;
    if (convError) throw convError;
    if (aiError) throw aiError;
    if (apptError) throw apptError;
    if (ordersError) throw ordersError;

    const eventRows = events || [];
    const convRows = conversations || [];
    const aiRows = aiResponses || [];
    const apptRows = appointments || [];
    const orderRows = orders || [];

    // ============ CALCULATE CORE METRICS ============
    const totalRevenue = eventRows.reduce((sum, e) => sum + (Number(e.revenue_value) || 0), 0);
    const convertedSessions = new Set(eventRows.filter(e => ["booking_completed", "order_completed"].includes(e.event_type)).map(e => e.session_id));
    const leadSessions = new Set(eventRows.filter(e => e.event_type === "lead_captured").map(e => e.session_id));
    const droppedLeads = Array.from(leadSessions).filter(s => !convertedSessions.has(s)).length;
    
    const avgConversionValue = convertedSessions.size > 0 ? totalRevenue / convertedSessions.size : 120;
    const leakageEstimate = droppedLeads * avgConversionValue;

    // After-hours missed
    const afterHoursMissed = convRows.filter(c => {
      const hour = new Date(c.created_at).getHours();
      return hour < 8 || hour > 19;
    }).length;

    // No-show rate
    const noShows = apptRows.filter(a => a.status === "no_show").length;
    const totalAppointments = apptRows.length;
    const noShowRate = totalAppointments > 0 ? noShows / totalAppointments : 0;

    // Response time
    const avgResponseTime = aiRows.length > 0 
      ? aiRows.reduce((sum, r) => sum + (r.metadata?.latency_ms || 0), 0) / aiRows.length 
      : 0;

    // ============ BUILD FUNNEL ============
    const visitors = convRows.length;
    const engaged = eventRows.filter(e => e.event_type === "lead_captured").length;
    const intent = eventRows.filter(e => ["booking_started", "order_started"].includes(e.event_type)).length;
    const converted = convertedSessions.size;
    
    const pct = (value: number) => visitors > 0 ? Math.round((value / visitors) * 100) : 0;

    const funnel = [
      { stage: "Visitors", value: visitors, pct: 100, dropoff_reason: null },
      { stage: "Engaged", value: engaged, pct: pct(engaged), dropoff_reason: engaged < visitors ? "No lead captured" : null },
      { stage: "Intent", value: intent, pct: pct(intent), dropoff_reason: intent < engaged ? "No booking/order action" : null },
      { stage: "Converted", value: converted, pct: pct(converted), dropoff_reason: converted < intent ? "Abandoned at confirmation" : null },
    ];

    // ============ INTENT DISTRIBUTION ============
    const intentMap = new Map<string, { count: number; scores: number[]; conversions: number }>();
    
    aiRows.forEach(r => {
      const intent = r.tags?.find((t: string) => !["effective_sales_mode", "low_confidence", "unanswered", "escalation", "high_intent"].includes(t)) || "general";
      const score = r.quality_score?.overall_score || 0;
      const converted = r.tags?.includes("high_intent") || false;
      
      if (!intentMap.has(intent)) intentMap.set(intent, { count: 0, scores: [], conversions: 0 });
      const entry = intentMap.get(intent)!;
      entry.count++;
      entry.scores.push(score);
      if (converted) entry.conversions++;
    });

    const intent_distribution = Array.from(intentMap.entries()).map(([intent, data]) => ({
      intent,
      count: data.count,
      avg_score: data.scores.length > 0 ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length * 100) : 0,
      conversion_rate: data.count > 0 ? Math.round((data.conversions / data.count) * 100) : 0,
    })).sort((a, b) => b.count - a.count);

    // ============ HEATMAP (hour x day) ============
    const heatmap: { hour: number; day: number; conversations: number; revenue: number }[] = [];
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const dayConvs = convRows.filter(c => {
          const d = new Date(c.created_at);
          return d.getDay() === day && d.getHours() === hour;
        });
        const dayRevenue = eventRows.filter(e => {
          const d = new Date(e.created_at);
          return d.getDay() === day && d.getHours() === hour;
        }).reduce((sum, e) => sum + (Number(e.revenue_value) || 0), 0);
        
        if (dayConvs.length > 0 || dayRevenue > 0) {
          heatmap.push({ hour, day, conversations: dayConvs.length, revenue: dayRevenue });
        }
      }
    }

    // ============ GENERATE INSIGHTS ============
    const insights: MEOInsight[] = [];
    const now = new Date().toISOString();

    // 1. Revenue Leak - Dropped Leads
    if (droppedLeads > 0) {
      insights.push({
        id: `leak_dropped_leads_${Date.now()}`,
        type: "revenue_leak",
        title: `${droppedLeads} lead${droppedLeads > 1 ? "s" : ""} ghosted this period`,
        description: `Customers received quotes/availability but didn't convert. Estimated revenue at risk.`,
        metric_value: `$${Math.round(leakageEstimate).toLocaleString()}`,
        metric_trend: "up",
        confidence: 0.87,
        urgency: droppedLeads > 5 ? "high" : "medium",
        suggested_action: "Add automated follow-up nudge within 2 hours of quote",
        action_type: "suggest",
        dismissible: true,
        created_at: now,
        amount: leakageEstimate,
      });
    }

    // 2. Revenue Leak - After Hours
    if (afterHoursMissed > 0) {
      const afterHoursValue = afterHoursMissed * (avgConversionValue * 0.5);
      insights.push({
        id: `leak_after_hours_${Date.now()}`,
        type: "revenue_leak",
        title: `${afterHoursMissed} after-hours conversation${afterHoursMissed > 1 ? "s" : ""} missed`,
        description: `Inquiries came in outside business hours with no auto-reply. 50% estimated conversion rate.`,
        metric_value: `$${Math.round(afterHoursValue).toLocaleString()}`,
        metric_trend: "stable",
        confidence: 0.92,
        urgency: afterHoursMissed > 10 ? "high" : "medium",
        suggested_action: "Enable after-hours auto-reply with lead capture form",
        action_type: "suggest",
        dismissible: true,
        created_at: now,
        amount: afterHoursValue,
      });
    }

    // 3. Capacity Waste - No-shows
    if (noShowRate > 0.15 && totalAppointments > 5) {
      insights.push({
        id: `waste_no_shows_${Date.now()}`,
        type: "capacity_waste",
        title: `No-show rate at ${Math.round(noShowRate * 100)}% (${noShows}/${totalAppointments})`,
        description: `Empty slots that could have been filled. Industry average is <10%.`,
        metric_value: `${Math.round(noShowRate * 100)}%`,
        metric_trend: noShowRate > 0.2 ? "up" : "stable",
        confidence: 0.85,
        urgency: noShowRate > 0.25 ? "critical" : "high",
        suggested_action: "Enable deposit requirement + 24hr reminder automation",
        action_type: "suggest",
        dismissible: true,
        created_at: now,
      });
    }

    // 4. Channel Decay - Response time
    if (avgResponseTime > 30000) { // >30 seconds
      insights.push({
        id: `decay_response_time_${Date.now()}`,
        type: "channel_decay",
        title: `AI response time: ${Math.round(avgResponseTime / 1000)}s avg`,
        description: `Slow responses correlate with 23% lower conversion. Target: <10s.`,
        metric_value: `${Math.round(avgResponseTime / 1000)}s`,
        metric_trend: "up",
        confidence: 0.78,
        urgency: avgResponseTime > 60000 ? "high" : "medium",
        suggested_action: "Check Gemini API latency; consider caching FAQ responses",
        action_type: "alert",
        dismissible: true,
        created_at: now,
      });
    }

    // 5. Growth Pattern - High Intent Conversations
    const highIntentConvs = aiRows.filter(r => (r.tags?.includes("high_intent") || r.metadata?.intent_score_1to10 >= 8)).length;
    if (highIntentConvs > 0) {
      insights.push({
        id: `growth_high_intent_${Date.now()}`,
        type: "growth_pattern",
        title: `${highIntentConvs} high-intent conversation${highIntentConvs > 1 ? "s" : ""} detected`,
        description: `These conversations scored 8+/10 on intent. Priority for proactive follow-up.`,
        metric_value: `${highIntentConvs} conversations`,
        metric_trend: "up",
        confidence: 0.94,
        urgency: "low",
        suggested_action: "Review live conversations tab; ensure Money Mode is active for these sessions",
        action_type: "suggest",
        dismissible: true,
        created_at: now,
      });
    }

    // 6. Opportunity - Low FAQ Match Rate
    const unansweredCount = aiRows.filter(r => r.tags?.includes("unanswered")).length;
    if (unansweredCount > 5) {
      insights.push({
        id: `opp_faq_gaps_${Date.now()}`,
        type: "opportunity",
        title: `${unansweredCount} questions AI couldn't answer`,
        description: `Knowledge base gaps are leaking trust. Add these as FAQs to improve self-serve rate.`,
        metric_value: `${unansweredCount} gaps`,
        metric_trend: "up",
        confidence: 0.89,
        urgency: "medium",
        suggested_action: "Export unanswered questions → add to FAQ manager",
        action_type: "suggest",
        dismissible: true,
        created_at: now,
      });
    }

    // 7. Risk - Fallback Rate High
    const fallbackCount = aiRows.filter(r => r.tags?.includes("low_confidence")).length;
    const fallbackRate = aiRows.length > 0 ? fallbackCount / aiRows.length : 0;
    if (fallbackRate > 0.2 && aiRows.length > 20) {
      insights.push({
        id: `risk_fallback_rate_${Date.now()}`,
        type: "risk",
        title: `Fallback rate at ${Math.round(fallbackRate * 100)}% (${fallbackCount}/${aiRows.length})`,
        description: `AI is frequently unsure. Review knowledge base and prompt quality.`,
        metric_value: `${Math.round(fallbackRate * 100)}%`,
        metric_trend: "up",
        confidence: 0.82,
        urgency: fallbackRate > 0.4 ? "critical" : "high",
        suggested_action: "Run KB rewrite; add missing service/pricing info",
        action_type: "alert",
        dismissible: true,
        created_at: now,
      });
    }

    // Sort by urgency then confidence
    const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    insights.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency] || b.confidence - a.confidence);

    // ============ SUMMARY ============
    const summary = {
      total_leaked: Math.round(leakageEstimate + afterHoursMissed * avgConversionValue * 0.5),
      total_opportunity: Math.round(highIntentConvs * avgConversionValue * 0.3),
      active_alerts: insights.filter(i => i.urgency === "high" || i.urgency === "critical").length,
      conversion_rate: visitors > 0 ? Math.round((converted / visitors) * 100) : 0,
      avg_booking_value: Math.round(avgConversionValue),
    };

    return jsonRes({
      insights,
      summary,
      funnel,
      intent_distribution,
      heatmap,
    });

  } catch (error) {
    console.error("[MEO Insights] Error:", error);
    return jsonRes({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});