import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const url = new URL(req.url);
    
    // POST /compute - compute comprehensive analytics for a user
    if (req.method === "POST" && url.pathname.endsWith("/compute")) {
      console.log("Analytics compute request received");
      const body = await req.json();
      const userId = body.userId;
      
      if (!userId) {
        return new Response(
          JSON.stringify({ error: "userId required" }), 
          { status: 400, headers: CORS }
        );
      }

      // Check cache first
      const { data: cached } = await supabase
        .from("analytics_cache")
        .select("data, updated_at")
        .eq("user_id", userId)
        .maybeSingle();

      // If cache is fresh (less than 5 minutes old), return it
      if (cached && cached.updated_at) {
        const cacheAge = Date.now() - new Date(cached.updated_at).getTime();
        if (cacheAge < 5 * 60 * 1000) {
          console.log("Returning cached analytics");
          return new Response(JSON.stringify({
            analytics: cached.data,
            cached: true
          }), { headers: CORS, status: 200 });
        }
      }

      // Get user's receptionists
      const { data: receptionists } = await supabase
        .from("receptionists")
        .select("id, name, business_name")
        .eq("user_id", userId);

      if (!receptionists || receptionists.length === 0) {
        const emptyAnalytics = { error: "No receptionists found" };
        return new Response(JSON.stringify({
          analytics: emptyAnalytics,
          cached: false
        }), { headers: CORS, status: 200 });
      }

      const receptionistIds = receptionists.map(r => r.id);

      // Compute conversation metrics
      const { data: conversations } = await supabase
        .from("conversations")
        .select("id, created_at, receptionist_id")
        .in("receptionist_id", receptionistIds);

      const { data: chatMessages } = await supabase
        .from("chat_messages")
        .select("id, created_at, metadata, receptionist_id")
        .in("receptionist_id", receptionistIds);

      const { data: appointments } = await supabase
        .from("appointments")
        .select("id, created_at, receptionist_id, status")
        .in("receptionist_id", receptionistIds);

      const { data: aiResponses } = await supabase
        .from("ai_responses")
        .select("quality_score, latency_ms, receptionist_id, created_at, request_message, reply_text")
        .in("receptionist_id", receptionistIds)
        .order("created_at", { ascending: false })
        .limit(1000);

      // Fetch conversion events for revenue attribution
      const { data: conversionEvents } = await supabase
        .from("conversion_events")
        .select("event_type, revenue_value, currency, receptionist_id, created_at, session_id, metadata")
        .in("receptionist_id", receptionistIds);

      // Fetch orders for commerce metrics
      const { data: orders } = await supabase
        .from("orders")
        .select("id, total_amount, status, receptionist_id, created_at")
        .in("receptionist_id", receptionistIds);

      // Calculate metrics
      const now = Date.now();
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);

      const recentConversations = conversations?.filter(c => 
        new Date(c.created_at).getTime() > thirtyDaysAgo
      ) || [];

      const recentMessages = chatMessages?.filter(m => 
        new Date(m.created_at).getTime() > thirtyDaysAgo
      ) || [];

      // Conversations per day (last 30 days)
      const conversationsPerDay: Record<string, number> = {};
      recentConversations.forEach(c => {
        const date = new Date(c.created_at).toISOString().split('T')[0];
        conversationsPerDay[date] = (conversationsPerDay[date] || 0) + 1;
      });

      // AI Quality metrics
      let totalQuality = 0, totalClarity = 0, totalAccuracy = 0, totalConfidence = 0;
      let qualityCount = 0, clarityCount = 0, accuracyCount = 0, confidenceCount = 0;
      let faqMatches = 0, semanticMatches = 0, fallbacks = 0, unanswered = 0;
      let totalLatency = 0, latencyCount = 0;

      aiResponses?.forEach(resp => {
        const qs = typeof resp.quality_score === 'string' 
          ? JSON.parse(resp.quality_score) 
          : resp.quality_score;
        
        if (qs) {
          if (qs.overall != null) { totalQuality += qs.overall; qualityCount++; }
          if (qs.clarity != null) { totalClarity += qs.clarity; clarityCount++; }
          if (qs.accuracy != null) { totalAccuracy += qs.accuracy; accuracyCount++; }
          if (qs.confidence != null) { totalConfidence += qs.confidence; confidenceCount++; }
          if (qs.faqMatch) faqMatches++;
          if (qs.semanticMatch) semanticMatches++;
          if (qs.fallback) fallbacks++;
          if (qs.unanswered) unanswered++;
        }

        if (resp.latency_ms) {
          totalLatency += resp.latency_ms;
          latencyCount++;
        }
      });

      const totalAIResponses = aiResponses?.length || 0;

      // Revenue attribution metrics
      const totalRevenue = conversionEvents?.reduce((sum, e) => sum + (Number(e.revenue_value) || 0), 0) || 0;
      const bookingEvents = conversionEvents?.filter(e => e.event_type === 'booking_completed') || [];
      const orderEvents = conversionEvents?.filter(e => e.event_type === 'order_completed') || [];
      const leadEvents = conversionEvents?.filter(e => e.event_type === 'lead_captured') || [];
      const checkoutEvents = conversionEvents?.filter(e => e.event_type === 'checkout_started') || [];
      const primaryCurrency = conversionEvents?.[0]?.currency || 'NGN';

      // Revenue over time (daily)
      const revenueByDay: Record<string, number> = {};
      conversionEvents?.forEach(e => {
        if (e.revenue_value && Number(e.revenue_value) > 0) {
          const date = new Date(e.created_at).toISOString().split('T')[0];
          revenueByDay[date] = (revenueByDay[date] || 0) + Number(e.revenue_value);
        }
      });

      // Conversion funnel
      const totalSessions = new Set(conversionEvents?.map(e => e.session_id) || []).size;
      const sessionsWithBooking = new Set(bookingEvents.map(e => e.session_id)).size;
      const sessionsWithOrder = new Set(orderEvents.map(e => e.session_id)).size;

      // Per-receptionist breakdown
      const receptionistBreakdown = receptionists.map(rec => {
        const recConvs = conversations?.filter(c => c.receptionist_id === rec.id).length || 0;
        const recAppts = appointments?.filter(a => a.receptionist_id === rec.id).length || 0;
        const recResponses = aiResponses?.filter(r => r.receptionist_id === rec.id) || [];
        const recConversionEvents = conversionEvents?.filter(e => e.receptionist_id === rec.id) || [];
        const recOrders = orders?.filter(o => o.receptionist_id === rec.id) || [];
        
        let recQuality = 0, recQualityCount = 0;
        let recFaqMatches = 0;
        
        recResponses.forEach(resp => {
          const qs = typeof resp.quality_score === 'string' 
            ? JSON.parse(resp.quality_score) 
            : resp.quality_score;
          if (qs?.overall != null) {
            recQuality += qs.overall;
            recQualityCount++;
          }
          if (qs?.faqMatch) recFaqMatches++;
        });

        const recRevenue = recConversionEvents.reduce((sum, e) => sum + (Number(e.revenue_value) || 0), 0);

        return {
          id: rec.id,
          name: rec.name,
          business_name: rec.business_name,
          conversations: recConvs,
          appointments: recAppts,
          orders: recOrders.length,
          avg_quality_score: recQualityCount > 0 ? (recQuality / recQualityCount) : null,
          faq_match_rate: recResponses.length > 0 ? (recFaqMatches / recResponses.length) : 0,
          revenue: recRevenue,
          bookings_completed: recConversionEvents.filter(e => e.event_type === 'booking_completed').length,
          leads_captured: recConversionEvents.filter(e => e.event_type === 'lead_captured').length,
        };
      });

      const analytics = {
        conversation_metrics: {
          total_conversations: conversations?.length || 0,
          total_messages: chatMessages?.length || 0,
          conversations_per_receptionist: (conversations?.length || 0) / receptionists.length,
          conversations_per_day: conversationsPerDay,
          average_conversation_length: chatMessages?.length && conversations?.length 
            ? (chatMessages.length / conversations.length) 
            : 0,
        },
        ai_quality_metrics: {
          avg_quality_score: qualityCount > 0 ? (totalQuality / qualityCount) : null,
          avg_clarity: clarityCount > 0 ? (totalClarity / clarityCount) : null,
          avg_accuracy: accuracyCount > 0 ? (totalAccuracy / accuracyCount) : null,
          avg_confidence: confidenceCount > 0 ? (totalConfidence / confidenceCount) : null,
          faq_match_rate: totalAIResponses > 0 ? (faqMatches / totalAIResponses) : 0,
          semantic_match_rate: totalAIResponses > 0 ? (semanticMatches / totalAIResponses) : 0,
          fallback_rate: totalAIResponses > 0 ? (fallbacks / totalAIResponses) : 0,
          unanswered_questions: unanswered,
        },
        business_metrics: {
          appointments_booked: appointments?.length || 0,
          lead_captures: leadEvents.length,
          booking_conversion_rate: conversations?.length 
            ? ((appointments?.length || 0) / conversations.length) 
            : 0,
        },
        revenue_metrics: {
          total_revenue: totalRevenue,
          currency: primaryCurrency,
          bookings_revenue: bookingEvents.reduce((sum, e) => sum + (Number(e.revenue_value) || 0), 0),
          orders_revenue: orderEvents.reduce((sum, e) => sum + (Number(e.revenue_value) || 0), 0),
          bookings_count: bookingEvents.length,
          orders_count: orderEvents.length,
          leads_count: leadEvents.length,
          avg_booking_value: bookingEvents.length > 0
            ? bookingEvents.reduce((sum, e) => sum + (Number(e.revenue_value) || 0), 0) / bookingEvents.length
            : 0,
          avg_order_value: orderEvents.length > 0
            ? orderEvents.reduce((sum, e) => sum + (Number(e.revenue_value) || 0), 0) / orderEvents.length
            : 0,
          revenue_over_time: Object.entries(revenueByDay)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, amount]) => ({ date, amount })),
        },
        conversion_funnel: {
          total_conversations: conversations?.length || 0,
          engaged_sessions: totalSessions,
          bookings_completed: sessionsWithBooking,
          orders_completed: sessionsWithOrder,
          leads_captured: leadEvents.length,
          booking_rate: conversations?.length ? (sessionsWithBooking / conversations.length) : 0,
          order_rate: conversations?.length ? (sessionsWithOrder / conversations.length) : 0,
        },
        performance_metrics: {
          average_response_time: latencyCount > 0 ? (totalLatency / latencyCount) : null,
        },
        receptionist_breakdown: receptionistBreakdown,
        computed_at: new Date().toISOString()
      };

      // Cache the result
      const { error: cacheError } = await supabase
        .from("analytics_cache")
        .upsert({
          user_id: userId,
          data: analytics,
          updated_at: new Date().toISOString()
        }, {
          onConflict: "user_id"
        });

      if (cacheError) {
        console.error("Error caching analytics:", cacheError);
      }

      console.log("Analytics computed successfully");
      return new Response(JSON.stringify({
        analytics,
        cached: false
      }), { headers: CORS, status: 200 });
    }
    
    // POST /ingest - persist analytics data
    if (req.method === "POST" && url.pathname.endsWith("/ingest")) {
      console.log("Analytics ingest request received");
      const body = await req.json();
      
      // expected body: { receptionist_id, user_id, request_message, reply_text, model, latency_ms, temperature, quality_score, channel }
      const payload = {
        receptionist_id: body.receptionist_id,
        user_id: body.user_id || null,
        request_message: body.request_message,
        reply_text: body.reply_text,
        model: body.model || null,
        latency_ms: body.latency_ms || null,
        temperature: body.temperature || null,
        quality_score: body.quality_score ? JSON.stringify(body.quality_score) : null,
        confidence: body.quality_score ? body.quality_score.confidence || body.quality_score.overall || null : null,
        channel: body.channel || "chat",
        flagged: false
      };
      
      console.log("Inserting analytics payload:", payload);
      const { error } = await supabase.from("ai_responses").insert([payload]);
      if (error) {
        console.error("Error inserting analytics:", error);
        throw error;
      }
      
      console.log("Analytics ingested successfully");
      return new Response(JSON.stringify({ ok: true }), { headers: CORS, status: 200 });
    }

    // POST /stats - retrieve aggregate statistics for a receptionist
    if (req.method === "POST" && url.pathname.endsWith("/stats")) {
      console.log("Stats request received");
      const body = await req.json();
      const receptionistId = body.receptionistId;
      const startDate = body.startDate;
      const endDate = body.endDate;
      
      if (!receptionistId) {
        return new Response(
          JSON.stringify({ error: "receptionistId required" }), 
          { status: 400, headers: CORS }
        );
      }

      console.log("Fetching stats for receptionist:", receptionistId, { startDate, endDate });

      // Build query with date filters
      let countQuery = supabase
        .from("ai_responses")
        .select("id", { count: "exact", head: true })
        .eq("receptionist_id", receptionistId);

      let dataQuery = supabase
        .from("ai_responses")
        .select("quality_score, latency_ms, created_at, request_message, reply_text")
        .eq("receptionist_id", receptionistId)
        .order("created_at", { ascending: false })
        .limit(1000);

      if (startDate) {
        countQuery = countQuery.gte("created_at", startDate);
        dataQuery = dataQuery.gte("created_at", startDate);
      }
      if (endDate) {
        countQuery = countQuery.lte("created_at", endDate);
        dataQuery = dataQuery.lte("created_at", endDate);
      }

      // Basic aggregates
      const totalRes = await countQuery;

      // Fetch rows to compute averages for quality and latency
      const rows = await dataQuery;

      let avgQualityScore = null;
      let avgLatency = null;
      const recentResponses: Array<{created_at: string, quality_score: number, latency_ms: number}> = [];

      if (rows?.data?.length) {
        // Calculate average quality score
        const qualityScores = rows.data
          .map(r => {
            try {
              const score = typeof r.quality_score === 'string' 
                ? JSON.parse(r.quality_score) 
                : r.quality_score;
              
              // Extract overall score or compute average of sub-scores
              if (score?.overall) return score.overall;
              if (score?.coherence && score?.relevance && score?.completeness) {
                return (score.coherence + score.relevance + score.completeness) / 3;
              }
              return null;
            } catch {
              return null;
            }
          })
          .filter((val): val is number => val !== null);
        
        if (qualityScores.length) {
          avgQualityScore = qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length;
        }

        // Calculate average latency
        const latencies = rows.data
          .map(r => r.latency_ms)
          .filter((val): val is number => val !== null && val > 0);
        
        if (latencies.length) {
          avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        }

        // Prepare recent responses with all needed data
        recentResponses.push(...rows.data.slice(0, 10).map(r => {
          let qualityScore = 0;
          try {
            const score = typeof r.quality_score === 'string' 
              ? JSON.parse(r.quality_score) 
              : r.quality_score;
            if (score?.overall) qualityScore = score.overall;
            else if (score?.coherence && score?.relevance && score?.completeness) {
              qualityScore = (score.coherence + score.relevance + score.completeness) / 3;
            }
          } catch {
            qualityScore = 0;
          }

          return {
            created_at: r.created_at,
            quality_score: qualityScore,
            latency_ms: r.latency_ms || 0
          };
        }));
      }

      let flaggedQuery = supabase
        .from("ai_responses")
        .select("id", { count: "exact", head: true })
        .eq("receptionist_id", receptionistId)
        .eq("flagged", true);

      if (startDate) {
        flaggedQuery = flaggedQuery.gte("created_at", startDate);
      }
      if (endDate) {
        flaggedQuery = flaggedQuery.lte("created_at", endDate);
      }

      const flagged = await flaggedQuery;

      // Calculate chart data
      const messageVolume: Record<string, number> = {};
      let exactMatches = 0, semanticMatches = 0, fallbacks = 0;
      const qualityBuckets = { "0-0.3": 0, "0.3-0.6": 0, "0.6-0.9": 0, "0.9-1.0": 0 };
      const latencyByDate: Record<string, { total: number; count: number }> = {};

      rows?.data?.forEach(r => {
        // Message volume
        const date = new Date(r.created_at).toISOString().split('T')[0];
        messageVolume[date] = (messageVolume[date] || 0) + 1;

        // Match rates
        const score = typeof r.quality_score === 'string' ? JSON.parse(r.quality_score) : r.quality_score;
        if (score?.faqMatch) exactMatches++;
        else if (score?.semanticMatch) semanticMatches++;
        else fallbacks++;

        // Quality distribution
        const overall = score?.overall || 0;
        if (overall < 0.3) qualityBuckets["0-0.3"]++;
        else if (overall < 0.6) qualityBuckets["0.3-0.6"]++;
        else if (overall < 0.9) qualityBuckets["0.6-0.9"]++;
        else qualityBuckets["0.9-1.0"]++;

        // Latency over time
        if (r.latency_ms) {
          if (!latencyByDate[date]) latencyByDate[date] = { total: 0, count: 0 };
          latencyByDate[date].total += r.latency_ms;
          latencyByDate[date].count++;
        }
      });

      const totalMessages = rows?.data?.length || 1;

      console.log("Stats computed successfully");
      return new Response(JSON.stringify({
        total_responses: totalRes.count ?? 0,
        avg_quality_score: avgQualityScore,
        flagged_count: flagged.count ?? 0,
        avg_latency: avgLatency,
        recent_responses: recentResponses,
        message_volume: Object.entries(messageVolume)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, count]) => ({ date, count })),
        match_rates: {
          exact: Math.round((exactMatches / totalMessages) * 100),
          semantic: Math.round((semanticMatches / totalMessages) * 100),
          fallback: Math.round((fallbacks / totalMessages) * 100)
        },
        quality_distribution: [
          { range: "0-0.3", count: qualityBuckets["0-0.3"] },
          { range: "0.3-0.6", count: qualityBuckets["0.3-0.6"] },
          { range: "0.6-0.9", count: qualityBuckets["0.6-0.9"] },
          { range: "0.9-1.0", count: qualityBuckets["0.9-1.0"] }
        ],
        latency_over_time: Object.entries(latencyByDate)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, { total, count }]) => ({ date, latency: Math.round(total / count) }))
      }), { headers: CORS, status: 200 });
    }

    return new Response(
      JSON.stringify({ error: "unsupported endpoint" }), 
      { status: 400, headers: CORS }
    );
  } catch (err) {
    console.error("Analytics function error:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: errorMessage }), 
      { status: 500, headers: CORS }
    );
  }
});
