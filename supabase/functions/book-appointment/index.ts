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
      startTime,
      customerName,
      customerEmail,
      customerPhone,
      userId,
      bookingSource = "ai_receptionist",
    } = body;

    console.log(`[book-appointment] Request:`, {
      receptionistId,
      serviceId,
      startTime,
      customerName,
      bookingSource,
    });

    // Validate required fields
    if (!receptionistId || !serviceId || !startTime || !customerName) {
      throw new Error("Missing required fields: receptionistId, serviceId, startTime, customerName");
    }

    // Require contact info (phone or email)
    if (!customerEmail && !customerPhone) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Contact information required: please provide phone or email" 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load service
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

    // Calculate appointment times
    const start = new Date(startTime);
    const end = new Date(start.getTime() + duration * 60000);
    
    const startWithBuffer = new Date(start.getTime() - bufferBefore * 60000);
    const endWithBuffer = new Date(end.getTime() + bufferAfter * 60000);

    console.log(`[book-appointment] Slot: ${start.toISOString()} - ${end.toISOString()}`);

    // Check for duplicate/idempotent bookings (same contact, same time +/- 15min)
    const windowBefore = new Date(start.getTime() - 15 * 60000).toISOString();
    const windowAfter = new Date(start.getTime() + 15 * 60000).toISOString();

    let duplicateQuery = supabase
      .from("appointments")
      .select("id, start_time, end_time, status, customer_name")
      .eq("receptionist_id", receptionistId)
      .gte("start_time", windowBefore)
      .lte("start_time", windowAfter);

    if (customerEmail) duplicateQuery = duplicateQuery.eq("customer_email", customerEmail);
    if (customerPhone) duplicateQuery = duplicateQuery.eq("customer_phone", customerPhone);

    const { data: existing } = await duplicateQuery.limit(1);

    if (existing && existing.length > 0) {
      console.log(`[book-appointment] Found existing appointment (idempotency): ${existing[0].id}`);
      return new Response(
        JSON.stringify({ 
          success: true,
          appointment: existing[0], 
          existed: true 
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Check for conflicts with existing appointments
    const { data: conflicts, error: conflictErr } = await supabase
      .from("appointments")
      .select("id, start_time, end_time, customer_name")
      .eq("receptionist_id", receptionistId)
      .neq("status", "cancelled")
      .or(`start_time.lt.${endWithBuffer.toISOString()},end_time.gt.${startWithBuffer.toISOString()}`);

    if (conflictErr) {
      console.error("[book-appointment] Conflict check error:", conflictErr);
      throw conflictErr;
    }

    // Filter conflicts in code for precise overlap detection
    const hasConflict = (conflicts || []).some((appt: any) => {
      const apptStart = new Date(appt.start_time);
      const apptEnd = new Date(appt.end_time);
      return !(endWithBuffer <= apptStart || startWithBuffer >= apptEnd);
    });

    if (hasConflict) {
      console.log(`[book-appointment] Conflict detected with existing appointments`);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Selected time slot is no longer available",
          conflicts 
        }),
        { 
          status: 409, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Generate secure tokens for cancellation and confirmation
    const cancellationToken = crypto.randomUUID();
    const confirmationToken = crypto.randomUUID();

    // Create appointment with source metadata
    const { data: appointment, error: insertErr } = await supabase
      .from("appointments")
      .insert({
        receptionist_id: receptionistId,
        service_id: serviceId,
        customer_name: customerName,
        customer_email: customerEmail || null,
        customer_phone: customerPhone || null,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        status: "booked",
        booking_source: bookingSource,
        created_by: userId || null,
        metadata: {
          source: bookingSource,
          booked_via_chat: bookingSource === "ai_receptionist",
          created_at: new Date().toISOString(),
          cancellation_token: cancellationToken,
          confirmation_token: confirmationToken,
        },
      })
      .select()
      .single();

    if (insertErr) {
      console.error("[book-appointment] Insert error:", insertErr);
      throw insertErr;
    }

    console.log(`[book-appointment] Created appointment ${appointment.id}`);

    // Log audit trail
    try {
      await supabase.from("appointment_logs").insert({
        appointment_id: appointment.id,
        action: "created",
        actor_id: userId || null,
        payload: {
          appointment,
          service: service.name,
          booking_source: bookingSource,
        },
      });
    } catch (logErr) {
      console.error("[book-appointment] log error:", logErr);
    }

    // Send notification to receptionist owner
    const { data: receptionist } = await supabase
      .from("receptionists")
      .select("user_id")
      .eq("id", receptionistId)
      .maybeSingle();

    if (receptionist?.user_id) {
      try {
        await supabase.from("notifications").insert({
          type: "appointment.created",
          title: `New Appointment: ${customerName}`,
          body: `${service.name} scheduled for ${start.toLocaleString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}`,
          message: `Appointment booked via ${bookingSource}`,
          receptionist_id: receptionistId,
          user_id: receptionist.user_id,
          severity: "info",
          category: "appointments",
          priority: "normal",
          metadata: {
            appointment_id: appointment.id,
            customer_name: customerName,
            service_name: service.name,
          },
        });
      } catch (notifErr) {
        console.error("[book-appointment] notification error:", notifErr);
      }
    }

    console.log(`[book-appointment] Notification sent`);

    return new Response(
      JSON.stringify({
        success: true,
        appointment: {
          ...appointment,
          service_name: service.name,
          cancellation_token: cancellationToken,
          confirmation_token: confirmationToken,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("[book-appointment] Error:", err);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: err.message || String(err) 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
