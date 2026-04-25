import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Receptionist = { id: string };
type ConversionEvent = {
  event_type: string;
  revenue_value: number | null;
  currency: string | null;
  created_at: string;
};

const clampSeverity = (impact: number): "low" | "medium" | "high" | "critical" => {
  if (impact >= 3000) return "critical";
  if (impact >= 1500) return "high";
  if (impact >= 500) return "medium";
  return "low";
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRole) {
      throw new Error("Missing Supabase service configuration");
    }

    const supabase = createClient(supabaseUrl, serviceRole);

    const body = await req.json().catch(() => ({}));
    const receptionistId = body?.receptionistId as string | undefined;

    let receptionistsQuery = supabase.from("receptionists").select("id");
    if (receptionistId) {
      receptionistsQuery = receptionistsQuery.eq("id", receptionistId);
    }

    const { data: receptionists, error: receptionistError } = await receptionistsQuery;
    if (receptionistError) throw receptionistError;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    let createdOrUpdated = 0;

    for (const receptionist of (receptionists ?? []) as Receptionist[]) {
      const { data: conversionEvents, error: eventsError } = await supabase
        .from("conversion_events")
        .select("event_type, revenue_value, currency, created_at")
        .eq("receptionist_id", receptionist.id)
        .gte("created_at", sevenDaysAgo.toISOString());

      if (eventsError) {
        console.error(`Failed loading events for receptionist ${receptionist.id}`, eventsError);
        continue;
      }

      const events = (conversionEvents ?? []) as ConversionEvent[];
      const leadEvents = events.filter((e) => e.event_type === "lead_captured");
      const bookingEvents = events.filter((e) => e.event_type === "booking_completed");
      const orderEvents = events.filter((e) => e.event_type === "order_completed");

      const currency = events[0]?.currency || "USD";
      const closedRevenue = [...bookingEvents, ...orderEvents].reduce(
        (sum, e) => sum + (Number(e.revenue_value) || 0),
        0,
      );
      const closeCount = bookingEvents.length + orderEvents.length;
      const averageDealValue = closeCount > 0 ? closedRevenue / closeCount : 120;

      const unconvertedLeads = Math.max(leadEvents.length - bookingEvents.length, 0);
      if (unconvertedLeads > 0) {
        const impact = Number((unconvertedLeads * averageDealValue * 0.6).toFixed(2));
        const { error: alertError } = await supabase.rpc("upsert_meo_alert", {
          p_receptionist_id: receptionist.id,
          p_type: "lead_dropoff",
          p_severity: clampSeverity(impact),
          p_title: "Unconverted leads detected",
          p_description: `${unconvertedLeads} captured leads did not convert to bookings in the last 7 days.`,
          p_estimated_impact: impact,
          p_currency: currency,
          p_recommended_action: "Trigger a follow-up sequence for unconverted leads within 15 minutes and offer one clear booking CTA.",
          p_metadata: {
            window_days: 7,
            leads: leadEvents.length,
            bookings: bookingEvents.length,
            avg_deal_value: averageDealValue,
          },
        });
        if (!alertError) createdOrUpdated += 1;
      }

      const offHoursLeads = leadEvents.filter((event) => {
        const hour = new Date(event.created_at).getUTCHours();
        return hour < 8 || hour >= 20;
      }).length;

      if (offHoursLeads > 0) {
        const impact = Number((offHoursLeads * averageDealValue * 0.35).toFixed(2));
        const { error: alertError } = await supabase.rpc("upsert_meo_alert", {
          p_receptionist_id: receptionist.id,
          p_type: "after_hours_coverage",
          p_severity: clampSeverity(impact),
          p_title: "After-hours demand needs coverage",
          p_description: `${offHoursLeads} leads arrived outside staffed hours in the last 7 days.`,
          p_estimated_impact: impact,
          p_currency: currency,
          p_recommended_action: "Enable an after-hours booking flow and automate SMS callback promises for next-business-day follow-up.",
          p_metadata: {
            window_days: 7,
            off_hours_leads: offHoursLeads,
            avg_deal_value: averageDealValue,
          },
        });
        if (!alertError) createdOrUpdated += 1;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        receptionistsProcessed: receptionists?.length || 0,
        alertsCreatedOrUpdated: createdOrUpdated,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("MEO analytics runner failed", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
