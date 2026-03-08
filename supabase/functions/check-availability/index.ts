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
    //
    // CRITICAL: We use Intl.DateTimeFormat to properly handle timezone offsets.
    // The Deno runtime runs in UTC, so naive setHours() would produce UTC times,
    // not business-local times. We must convert business-local → UTC correctly.

    /**
     * Convert a date + time-of-day in a specific IANA timezone to a UTC Date.
     * E.g. "2026-03-10" + "09:00" in "Africa/Lagos" → UTC Date for 08:00 UTC.
     */
    function businessLocalToUTC(dateStr: string, timeStr: string, tz: string): Date {
      // Build an ISO-like string and let the runtime parse it,
      // then adjust for the timezone offset.
      const [hours, minutes] = timeStr.split(":").map(Number);
      
      // Create a date in UTC first
      const utcDate = new Date(`${dateStr}T${timeStr}:00Z`);
      
      // Find the offset of the business timezone at this moment
      // by comparing UTC vs local representation
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      
      // Get what UTC midnight looks like in the target timezone
      const testDate = new Date(`${dateStr}T12:00:00Z`);
      const parts = formatter.formatToParts(testDate);
      const getPart = (type: string) => parseInt(parts.find(p => p.type === type)?.value || "0");
      
      const localHour = getPart("hour");
      const localMinute = getPart("minute");
      // Offset in minutes: local = UTC + offset → offset = (localH*60+localM) - (12*60+0)
      const offsetMinutes = (localHour * 60 + localMinute) - (12 * 60);
      
      // Business local time in UTC = local time - offset
      const result = new Date(`${dateStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00Z`);
      result.setMinutes(result.getMinutes() - offsetMinutes);
      
      return result;
    }

    const slots: any[] = [];
    let currentDay = new Date(searchStart);
    currentDay.setUTCHours(0, 0, 0, 0);

    while (currentDay < searchEnd && slots.length < maxSlots) {
      const dayOfWeek = currentDay.getUTCDay(); // Use UTC to avoid server-local issues
      
      // Format date string for conversion helper
      const year = currentDay.getUTCFullYear();
      const month = String(currentDay.getUTCMonth() + 1).padStart(2, '0');
      const dayStr = String(currentDay.getUTCDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${dayStr}`;

      // We need to check rules for the LOCAL day-of-week in each rule's timezone
      // For simplicity & correctness, iterate all rules and check if this UTC date
      // corresponds to the right day_of_week in the rule's timezone
      const dayRules = (rules || []).filter((r: any) => {
        const ruleTz = r.timezone || 'UTC';
        // Check what day_of_week this date is in the rule's timezone
        const localDow = new Intl.DateTimeFormat("en-US", {
          timeZone: ruleTz,
          weekday: "short"
        }).format(currentDay);
        const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        const localDayNum = dowMap[localDow] ?? dayOfWeek;
        return Number(r.day_of_week) === localDayNum;
      });
      
      for (const rule of dayRules) {
        const ruleTz = rule.timezone || 'UTC';
        
        // Convert business-local start/end to UTC
        let slotStart = businessLocalToUTC(dateStr, rule.start_time || "09:00", ruleTz);
        const dayEnd = businessLocalToUTC(dateStr, rule.end_time || "17:00", ruleTz);

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

          // Check manually blocked slots from appointment_slots table
          const isManuallyBlocked = (blockedSlots || []).some((bs: any) => {
            const bsStart = new Date(bs.start_time);
            const bsEnd = new Date(bs.end_time);
            return !(slotEnd <= bsStart || slotStart >= bsEnd);
          });

          if (!hasCollision && !isManuallyBlocked) {
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

      currentDay.setUTCDate(currentDay.getUTCDate() + 1);
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
