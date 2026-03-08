import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Phase 8: Production Hardening
import { checkRateLimit, RATE_LIMITS, rateLimitResponse } from "../_shared/rateLimiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
      maxSlots = 10,
      desiredStart = null,
      desiredEnd = null,
      durationMinutes = null,
      request_message = ""
    } = body;

    if (!receptionistId) throw new Error("receptionistId required");

    // Phase 8: Rate limiting with shared limiter
    const rateCheck = checkRateLimit(`avail:${receptionistId}`, RATE_LIMITS.checkAvailability);
    if (!rateCheck.allowed) {
      return rateLimitResponse(rateCheck.retryAfterMs, rateCheck.reason);
    }

    console.log(`[check-availability] Checking for receptionist ${receptionistId}`);

    // Load service details (if serviceId provided)
    let service = null;
    let duration = durationMinutes || 30;
    let bufferBefore = 5;
    let bufferAfter = 5;

    if (serviceId) {
      const { data: svc, error: srvErr } = await supabase
        .from("services")
        .select("*")
        .eq("id", serviceId)
        .maybeSingle();

      if (srvErr || !svc) {
        console.warn("[check-availability] Service not found, using defaults");
      } else {
        service = svc;
        duration = svc.duration_minutes || 30;
        bufferBefore = svc.buffer_before_minutes || 5;
        bufferAfter = svc.buffer_after_minutes || 5;
        console.log(`[check-availability] Service: ${svc.name}, duration: ${duration}min`);
      }
    }

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

    // Fetch manually blocked slots from appointment_slots table
    // (e.g. owner blocked via calendar UI without creating an availability_exception)
    const { data: blockedSlots } = await supabase
      .from("appointment_slots")
      .select("start_time, end_time")
      .eq("receptionist_id", receptionistId)
      .eq("is_available", false)
      .gte("start_time", searchStart.toISOString())
      .lt("end_time", searchEnd.toISOString());

    console.log(`[check-availability] Found ${blockedSlots?.length || 0} manually blocked slots`);

    // Generate candidate slots
    // Slots are generated in the BUSINESS timezone (from availability_rules)
    // and returned as UTC ISO strings. The frontend converts to customer's local time.
    const slots: any[] = [];
    let currentDay = new Date(searchStart);
    currentDay.setHours(0, 0, 0, 0);

    while (currentDay < searchEnd && slots.length < maxSlots) {
      const dayOfWeek = currentDay.getDay(); // 0=Sunday, 6=Saturday
      
      // Find rules for this day
      const dayRules = (rules || []).filter((r: any) => Number(r.day_of_week) === dayOfWeek);
      
      for (const rule of dayRules) {
        const ruleTz = rule.timezone || 'UTC';
        const [startH, startM] = (rule.start_time || "09:00").split(":").map(Number);
        const [endH, endM] = (rule.end_time || "17:00").split(":").map(Number);
        
        // Build slot times relative to the business timezone
        // We construct date strings and let the runtime handle conversion
        const year = currentDay.getFullYear();
        const month = String(currentDay.getMonth() + 1).padStart(2, '0');
        const day = String(currentDay.getDate()).padStart(2, '0');
        
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
            // Return ISO strings (UTC) — frontend converts to customer's local timezone
            slots.push({
              start: slotStart.toISOString(),
              end: slotEnd.toISOString(),
              businessTimezone: ruleTz,
              display: slotStart.toLocaleString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZone: ruleTz,
              }),
            });
          }

          slotStart = new Date(slotStart.getTime() + 15 * 60000);
        }
      }

      currentDay.setDate(currentDay.getDate() + 1);
    }

    console.log(`[check-availability] Generated ${slots.length} available slots`);

    // Check if specific time was requested
    let available = false;
    let alternatives: any[] = [];

    if (desiredStart && desiredEnd) {
      const requestedStart = new Date(desiredStart);
      const requestedEnd = new Date(desiredEnd);
      
      // Check if requested time is in our available slots
      available = slots.some((slot: any) => {
        const slotStart = new Date(slot.start);
        const slotEnd = new Date(slot.end);
        return Math.abs(slotStart.getTime() - requestedStart.getTime()) < 60000 &&
               Math.abs(slotEnd.getTime() - requestedEnd.getTime()) < 60000;
      });

      if (!available) {
        // Generate scored alternatives
        alternatives = slots.slice(0, 5).map((slot: any) => {
          const slotStart = new Date(slot.start);
          const timeDiff = Math.abs(slotStart.getTime() - requestedStart.getTime());
          const hoursDiff = timeDiff / (1000 * 60 * 60);
          const score = Math.max(0, 1 - (hoursDiff / 24)); // Closer = higher score
          
          return {
            start: slot.start,
            end: slot.end,
            score,
            reason: `${slot.display} (${hoursDiff.toFixed(1)}h from requested)`
          };
        }).sort((a: any, b: any) => b.score - a.score);

        // Save suggestions for analytics
        await supabase.from("ai_booking_suggestions").insert({
          receptionist_id: receptionistId,
          request_message,
          suggestions: alternatives,
          model: "slot-scoring",
          latency_ms: Date.now() - Date.parse(new Date().toISOString()),
        });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        available, 
        slots, 
        alternatives,
        service 
      }),
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
