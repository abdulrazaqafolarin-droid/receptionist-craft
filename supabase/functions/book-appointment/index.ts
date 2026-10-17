import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Phase 3: Enhanced Booking Validation
import { 
  createBookingValidator, 
  formatValidationErrors,
  formatConflictMessage,
  formatSuggestions,
  type ValidationResult,
} from "../_shared/bookingValidator.ts";

// Phase 8: Production Hardening
import { checkRateLimit, RATE_LIMITS, rateLimitResponse } from "../_shared/rateLimiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function sanitize(input: string | null | undefined, maxLen = 500): string {
  if (!input || typeof input !== 'string') return '';
  return input.slice(0, maxLen).replace(/[<>]/g, '').trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "")
    );

    const body = await req.json().catch(() => ({}));
    const receptionistId = body.receptionistId;
    const serviceId = body.serviceId;
    const startTime = body.startTime;
    const rawCustomerName = body.customerName;
    const rawCustomerEmail = body.customerEmail;
    const rawCustomerPhone = body.customerPhone;
    const userId = body.userId;
    const bookingSource = body.bookingSource || "ai_receptionist";
    const metadata = body.metadata || {};
    const rawNotes = body.notes;

    // Phase 8: Rate limiting with shared limiter (burst protection)
    const rateLimitKey = `booking:${receptionistId}:${userId || 'anon'}`;
    const rateCheck = checkRateLimit(rateLimitKey, RATE_LIMITS.booking);
    if (!rateCheck.allowed) {
      console.log(`[book-appointment] Rate limited: ${rateLimitKey} (reason: ${rateCheck.reason})`);
      return rateLimitResponse(rateCheck.retryAfterMs, rateCheck.reason);
    }

    // Sanitize inputs
    const customerName = sanitize(rawCustomerName, 100);
    const customerEmail = sanitize(rawCustomerEmail, 255);
    const customerPhone = sanitize(rawCustomerPhone, 30);
    const notes = sanitize(rawNotes, 1000);

    // Extract idempotency key from metadata if provided
    const idempotencyKey = metadata?.idempotency_key || null;

    console.log(`[book-appointment] Request:`, {
      receptionistId,
      serviceId,
      startTime,
      customerName: customerName.slice(0, 20) + '...',
      bookingSource,
    });

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 3: ENHANCED BOOKING VALIDATION
    // Uses BookingValidator for comprehensive checks
    // ═══════════════════════════════════════════════════════════════════════
    const validator = createBookingValidator(supabase);
    const validationResult: ValidationResult = await validator.validateBooking({
      receptionistId,
      serviceId,
      startTime,
      customerName,
      customerEmail,
      customerPhone,
      userId,
      bookingSource,
      metadata,
    });
    
    if (!validationResult.valid) {
      console.log(`[book-appointment] Validation failed:`, validationResult.errors);
      
      // Format error response
      const errorMessage = formatValidationErrors(validationResult);
      const conflictMessage = validationResult.conflicts ? formatConflictMessage(validationResult.conflicts) : '';
      const suggestionsMessage = validationResult.suggestions ? formatSuggestions(validationResult.suggestions) : '';
      
      // Determine status code based on error type
      const firstError = validationResult.errors[0];
      let statusCode = 400;
      if (firstError?.code === 'TIME_CONFLICT') statusCode = 409;
      if (firstError?.code === 'DAILY_LIMIT_EXCEEDED') statusCode = 429;
      
      return new Response(
        JSON.stringify({ 
          success: false,
          error: firstError?.message || 'Validation failed',
          errors: validationResult.errors,
          warnings: validationResult.warnings,
          conflicts: validationResult.conflicts,
          suggestions: validationResult.suggestions,
          formatted: {
            errors: errorMessage,
            conflicts: conflictMessage,
            suggestions: suggestionsMessage,
          }
        }),
        { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Log any warnings
    if (validationResult.warnings.length > 0) {
      console.log(`[book-appointment] Warnings:`, validationResult.warnings);
    }

    // Load service for duration calculation
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

    console.log(`[book-appointment] Validated slot: ${start.toISOString()} - ${end.toISOString()}`);

    // IDEMPOTENCY CHECK: Check by idempotency_key first (if provided)
    if (idempotencyKey) {
      const { data: existingByKey } = await supabase
        .from("appointments")
        .select("*")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (existingByKey) {
        console.log(`[book-appointment] Found existing by idempotency_key: ${existingByKey.id}`);
        return new Response(
          JSON.stringify({ 
            success: true,
            appointment: existingByKey, 
            existed: true 
          }),
          { 
            status: 200, 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          }
        );
      }
    }

    // Check for duplicate bookings (same contact, same time +/- 15min)
    const windowBefore = new Date(start.getTime() - 15 * 60000).toISOString();
    const windowAfter = new Date(start.getTime() + 15 * 60000).toISOString();

    let duplicateQuery = supabase
      .from("appointments")
      .select("id, start_time, end_time, status, customer_name, customer_email, customer_phone")
      .eq("receptionist_id", receptionistId)
      .gte("start_time", windowBefore)
      .lte("start_time", windowAfter)
      .neq("status", "cancelled");

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
    interface Appointment {
  start_time: string;
  end_time: string;
}

const hasConflict = (conflicts || []).some((appt: Appointment) => {
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

    // Create appointment with all new columns
    const { data: appointment, error: insertErr } = await supabase
      .from("appointments")
      .insert({
        receptionist_id: receptionistId,
        service_id: serviceId,
        service: service.name,
        customer_name: customerName,
        customer_email: customerEmail || null,
        customer_phone: customerPhone || null,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        status: "booked",
        booking_source: bookingSource,
        created_by: userId || null,
        notes: notes || null,
        staff_id: metadata?.staff_id || null,
        idempotency_key: idempotencyKey,
        cancellation_token: cancellationToken,
        confirmation_token: confirmationToken,
        metadata: {
          source: bookingSource,
          booked_via_chat: bookingSource === "ai_receptionist",
          created_at: new Date().toISOString(),
          cancellation_token: cancellationToken,
          confirmation_token: confirmationToken,
          ...(metadata || {}),
        },
      })
      .select()
      .single();

    if (insertErr) {
      // Handle unique violation (23505) gracefully — return existing record
      if (insertErr.code === '23505' && idempotencyKey) {
        console.log(`[book-appointment] Unique violation for idempotency_key ${idempotencyKey}, fetching existing record`);
        const { data: existing } = await supabase
          .from("appointments")
          .select("*")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        if (existing) {
          return new Response(
            JSON.stringify({ success: true, appointment: existing, existed: true }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      console.error("[book-appointment] Insert error:", insertErr);
      throw insertErr;
    }

    console.log(`[book-appointment] Created appointment ${appointment.id}`);

    // Mark overlapping appointment_slots as unavailable
    try {
      const { data: markedSlots, error: slotErr } = await supabase
        .from("appointment_slots")
        .update({ 
          is_available: false,
          metadata: { 
            booked_by_appointment: appointment.id,
            booked_at: new Date().toISOString(),
          }
        })
        .eq("receptionist_id", receptionistId)
        .eq("is_available", true)
        .lt("start_time", end.toISOString())
        .gt("end_time", start.toISOString())
        .select("id");

      const count = markedSlots?.length || 0;
      if (slotErr) {
        console.error("[book-appointment] Slot marking error:", slotErr);
      } else {
        console.log(`[book-appointment] Marked ${count} slot(s) as unavailable`);
      }
    } catch (slotMarkErr) {
      console.error("[book-appointment] Slot marking failed:", slotMarkErr);
      // Non-fatal: don't fail the booking
    }

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
          conversation_id: metadata?.session_id || null,
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

    // Send booking confirmation email using new edge function
    if (customerEmail) {
      try {
        await supabase.functions.invoke("send-booking-email", {
          body: { appointmentId: appointment.id },
          headers: {
            "x-rutex-cron-secret": Deno.env.get("RUTEX_INTERNAL_CRON_SECRET") || "",
          },
        });
        console.log(`[book-appointment] Confirmation email sent`);
      } catch (emailErr) {
        console.error("[book-appointment] Email send failed:", emailErr);
        // Don't fail the booking if email fails
      }
    }

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
  } catch (err) {
    console.error("[book-appointment] Error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
