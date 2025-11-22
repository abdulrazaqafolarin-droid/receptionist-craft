import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const { 
      receptionistId, 
      serviceId, 
      startDate, 
      endDate, 
      maxSlots = 10 
    } = body;

    if (!receptionistId) throw new Error("receptionistId required");
    if (!serviceId) throw new Error("serviceId required");

    console.log(`[check-availability] Checking for receptionist ${receptionistId}, service ${serviceId}`);

    // Load service details
    const { data: service, error: srvErr } = await supabase
      .from("services")
      .select("*")
      .eq("id", serviceId)
      .maybeSingle();

    if (srvErr || !service) {
      throw new Error("Service not found");
    }

    const duration = service.duration_minutes || 30;
    const bufferBefore = service.buffer_before_minutes || 5;
    const bufferAfter = service.buffer_after_minutes || 5;

    console.log(`[check-availability] Service: ${service.name}, duration: ${duration}min`);

    // Define search window (default: next 7 days from now)
    const now = new Date();
    const searchStart = startDate ? new Date(startDate) : now;
    const searchEnd = endDate ? new Date(endDate) : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Fetch availability rules
    const { data: rules } = await supabase
      .from("availability_rules")
      .select("*")
      .eq("receptionist_id", receptionistId);

    console.log(`[check-availability] Found ${rules?.length || 0} availability rules`);

    // Fetch exceptions (holidays/blocked time)
    const { data: exceptions } = await supabase
      .from("availability_exceptions")
      .select("*")
      .eq("receptionist_id", receptionistId)
      .gte("end_timestamptz", searchStart.toISOString())
      .lte("start_timestamptz", searchEnd.toISOString());

    console.log(`[check-availability] Found ${exceptions?.length || 0} exceptions`);

    // Fetch existing appointments
    const { data: appointments } = await supabase
      .from("appointments")
      .select("id, start_time, end_time, status")
      .eq("receptionist_id", receptionistId)
      .neq("status", "cancelled")
      .gte("start_time", searchStart.toISOString())
      .lt("end_time", searchEnd.toISOString());

    console.log(`[check-availability] Found ${appointments?.length || 0} existing appointments`);

    // Generate candidate slots
    const slots: any[] = [];
    let currentDay = new Date(searchStart);
    currentDay.setHours(0, 0, 0, 0);

    while (currentDay < searchEnd && slots.length < maxSlots) {
      const dayOfWeek = currentDay.getDay(); // 0=Sunday, 6=Saturday
      
      // Find rules for this day
      const dayRules = (rules || []).filter((r: any) => Number(r.day_of_week) === dayOfWeek);
      
      for (const rule of dayRules) {
        const [startH, startM] = (rule.start_time || "09:00").split(":").map(Number);
        const [endH, endM] = (rule.end_time || "17:00").split(":").map(Number);
        
        let slotStart = new Date(currentDay);
        slotStart.setHours(startH, startM, 0, 0);
        
        const dayEnd = new Date(currentDay);
        dayEnd.setHours(endH, endM, 0, 0);

        // Iterate through time slots in 15-minute increments
        while (slotStart < dayEnd && slots.length < maxSlots) {
          const slotEnd = new Date(slotStart.getTime() + duration * 60000);
          
          // Check if slot end exceeds day end
          if (slotEnd > dayEnd) break;

          // Skip past slots
          if (slotStart < now) {
            slotStart = new Date(slotStart.getTime() + 15 * 60000);
            continue;
          }

          // Apply buffers for collision detection
          const slotStartWithBuffer = new Date(slotStart.getTime() - bufferBefore * 60000);
          const slotEndWithBuffer = new Date(slotEnd.getTime() + bufferAfter * 60000);

          // Check exceptions
          const hasException = (exceptions || []).some((ex: any) => {
            const exStart = new Date(ex.start_timestamptz);
            const exEnd = new Date(ex.end_timestamptz);
            return !(slotEndWithBuffer <= exStart || slotStartWithBuffer >= exEnd);
          });

          if (hasException) {
            slotStart = new Date(slotStart.getTime() + 15 * 60000);
            continue;
          }

          // Check appointment collisions
          const hasCollision = (appointments || []).some((appt: any) => {
            const apptStart = new Date(appt.start_time);
            const apptEnd = new Date(appt.end_time);
            return !(slotEndWithBuffer <= apptStart || slotStartWithBuffer >= apptEnd);
          });

          if (!hasCollision) {
            slots.push({
              start: slotStart.toISOString(),
              end: slotEnd.toISOString(),
              display: slotStart.toLocaleString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              }),
            });
          }

          slotStart = new Date(slotStart.getTime() + 15 * 60000);
        }
      }

      currentDay.setDate(currentDay.getDate() + 1);
    }

    console.log(`[check-availability] Generated ${slots.length} available slots`);

    return new Response(
      JSON.stringify({ success: true, slots, service }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  } catch (err: any) {
    console.error("[check-availability] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message || String(err) }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
