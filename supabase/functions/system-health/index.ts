import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getAllCircuitStats } from "../_shared/circuitBreaker.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseKey = (Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
    const credentialFormat = supabaseKey.startsWith("eyJ") ? "legacy_jwt" : "opaque";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      supabaseKey
    );

    // Verify caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Parallel data fetching for speed
    const [
      receptionistsResult,
      appointmentsResult,
      conversationsResult,
      ordersResult,
      notificationsResult,
      aiResponsesResult,
      servicesResult,
    ] = await Promise.all([
      // Active receptionists
      supabase
        .from("receptionists")
        .select("id, name, active, business_name, model")
        .eq("user_id", user.id),

      // Appointments in last 24h
      supabase
        .from("appointments")
        .select("id, status, created_at, booking_source")
        .gte("created_at", oneDayAgo.toISOString())
        .order("created_at", { ascending: false })
        .limit(100),

      // Conversations in last 24h
      supabase
        .from("conversations")
        .select("id, created_at")
        .gte("created_at", oneDayAgo.toISOString())
        .limit(500),

      // Orders in last 24h
      supabase
        .from("orders")
        .select("id, status, total_amount, created_at")
        .gte("created_at", oneDayAgo.toISOString())
        .limit(100),

      // Recent notifications (errors/warnings)
      supabase
        .from("notifications")
        .select("id, type, severity, created_at, title")
        .eq("user_id", user.id)
        .gte("created_at", oneDayAgo.toISOString())
        .order("created_at", { ascending: false })
        .limit(50),

      // AI response quality in last hour
      supabase
        .from("ai_responses")
        .select("id, quality_score, latency_ms, flagged, confidence, created_at")
        .gte("created_at", oneHourAgo.toISOString())
        .order("created_at", { ascending: false })
        .limit(100),

      // Services with stock info
      supabase
        .from("services")
        .select("id, name, is_product, stock_quantity, low_stock_threshold, active")
        .eq("active", true),
    ]);

    // Process circuit breaker stats
    const circuitBreakers = getAllCircuitStats();

    // Process appointment stats
    const appointments = appointmentsResult.data || [];
    const appointmentStats = {
      total24h: appointments.length,
      booked: appointments.filter((a: any) => a.status === "booked").length,
      confirmed: appointments.filter((a: any) => a.status === "confirmed").length,
      cancelled: appointments.filter((a: any) => a.status === "cancelled").length,
      bySource: {} as Record<string, number>,
    };
    appointments.forEach((a: any) => {
      const src = a.booking_source || "unknown";
      appointmentStats.bySource[src] = (appointmentStats.bySource[src] || 0) + 1;
    });

    // Process AI quality stats
    const aiResponses = aiResponsesResult.data || [];
    const latencies = aiResponses.map((r: any) => r.latency_ms).filter(Boolean);
    const aiStats = {
      totalLastHour: aiResponses.length,
      flagged: aiResponses.filter((r: any) => r.flagged).length,
      avgLatencyMs: latencies.length > 0
        ? Math.round(latencies.reduce((a: number, b: number) => a + b, 0) / latencies.length)
        : null,
      p95LatencyMs: latencies.length > 0
        ? latencies.sort((a: number, b: number) => a - b)[Math.floor(latencies.length * 0.95)]
        : null,
      avgConfidence: aiResponses.length > 0
        ? +(aiResponses.reduce((sum: number, r: any) => sum + (r.confidence || 0), 0) / aiResponses.length).toFixed(2)
        : null,
    };

    // Process order stats
    const orders = ordersResult.data || [];
    const orderStats = {
      total24h: orders.length,
      totalRevenue: orders.reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0),
      pending: orders.filter((o: any) => o.status === "pending").length,
      completed: orders.filter((o: any) => o.status === "completed").length,
    };

    // Stock alerts
    const services = servicesResult.data || [];
    const stockAlerts = services
      .filter((s: any) => s.is_product && s.stock_quantity !== null)
      .filter((s: any) => s.stock_quantity <= (s.low_stock_threshold || 5))
      .map((s: any) => ({
        id: s.id,
        name: s.name,
        stock: s.stock_quantity,
        threshold: s.low_stock_threshold || 5,
        critical: s.stock_quantity === 0,
      }));

    // Notification breakdown
    const notifications = notificationsResult.data || [];
    const notificationStats = {
      total24h: notifications.length,
      critical: notifications.filter((n: any) => n.severity === "critical").length,
      warnings: notifications.filter((n: any) => n.severity === "warning").length,
      recentErrors: notifications
        .filter((n: any) => n.severity === "critical" || n.type?.includes("error"))
        .slice(0, 5)
        .map((n: any) => ({ title: n.title, type: n.type, time: n.created_at })),
    };

    // Overall health score (0-100)
    let healthScore = 100;
    const healthIssues: string[] = [];

    // Deduct for circuit breakers open
    const openCircuits = Object.entries(circuitBreakers).filter(([, s]) => s.state === "open");
    if (openCircuits.length > 0) {
      healthScore -= openCircuits.length * 20;
      healthIssues.push(`${openCircuits.length} circuit breaker(s) open`);
    }

    // Deduct for flagged AI responses
    if (aiStats.flagged > 0) {
      healthScore -= Math.min(aiStats.flagged * 5, 20);
      healthIssues.push(`${aiStats.flagged} flagged AI responses`);
    }

    // Deduct for high latency
    if (aiStats.p95LatencyMs && aiStats.p95LatencyMs > 10000) {
      healthScore -= 10;
      healthIssues.push(`High AI latency (p95: ${aiStats.p95LatencyMs}ms)`);
    }

    // Deduct for critical notifications
    if (notificationStats.critical > 0) {
      healthScore -= Math.min(notificationStats.critical * 10, 30);
      healthIssues.push(`${notificationStats.critical} critical notifications`);
    }

    // Deduct for stock alerts
    const criticalStock = stockAlerts.filter((s: any) => s.critical);
    if (criticalStock.length > 0) {
      healthScore -= criticalStock.length * 5;
      healthIssues.push(`${criticalStock.length} product(s) out of stock`);
    }

    healthScore = Math.max(0, healthScore);

    const healthStatus = healthScore >= 90 ? "healthy" : healthScore >= 70 ? "degraded" : "critical";

    return new Response(
      JSON.stringify({
        timestamp: now.toISOString(),
        credentialFormat,
        health: {
          score: healthScore,
          status: healthStatus,
          issues: healthIssues,
        },
        receptionists: {
          total: (receptionistsResult.data || []).length,
          active: (receptionistsResult.data || []).filter((r: any) => r.active).length,
          list: (receptionistsResult.data || []).map((r: any) => ({
            id: r.id,
            name: r.name,
            business: r.business_name,
            model: r.model,
            active: r.active,
          })),
        },
        circuitBreakers,
        appointments: appointmentStats,
        ai: aiStats,
        orders: orderStats,
        stockAlerts,
        notifications: notificationStats,
        conversations: {
          total24h: (conversationsResult.data || []).length,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("[system-health] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message || String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
