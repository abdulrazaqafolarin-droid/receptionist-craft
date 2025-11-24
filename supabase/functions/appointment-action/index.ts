// supabase/functions/appointment-action/index.ts
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://esm.sh/zod@3.21.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const schema = z.object({
      action: z.enum(["confirm", "cancel", "reschedule"]),
      appointment_id: z.string().uuid().optional().nullable(),
      appointmentId: z.string().uuid().optional().nullable(),
      token: z.string().optional().nullable(),
      cancellationToken: z.string().optional().nullable(),
      confirmationToken: z.string().optional().nullable(),
      reason: z.string().optional().nullable(),
      new_start_time: z.string().optional().nullable(),
      userId: z.string().uuid().optional().nullable(),
    });
    const parsed = schema.parse(body);
    
    const appointmentId = parsed.appointment_id || parsed.appointmentId;
    const token = parsed.token || parsed.cancellationToken || parsed.confirmationToken;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { action, reason, new_start_time, userId } = parsed;

    if (!appointmentId) {
      throw new Error("appointmentId is required");
    }

    console.log(`[appointment-action] ${action} for ${appointmentId}`);

    // Get appointment details
    const { data: appt, error: fetchErr } = await supabase
      .from("appointments")
      .select("*, receptionists(user_id)")
      .eq("id", appointmentId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    if (!appt) {
      return new Response(
        JSON.stringify({ error: "Appointment not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // TOKEN VALIDATION for confirm/cancel actions (if token provided)
    if (token && (action === "confirm" || action === "cancel")) {
      const storedCancellationToken = appt.cancellation_token || appt.metadata?.cancellation_token;
      const storedConfirmationToken = appt.confirmation_token || appt.metadata?.confirmation_token;
      
      const isValidToken = 
        (action === "cancel" && token === storedCancellationToken) ||
        (action === "confirm" && token === storedConfirmationToken);

      if (!isValidToken) {
        console.log(`[appointment-action] Invalid token for ${action}`);
        return new Response(
          JSON.stringify({ error: "Invalid or expired token" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      console.log(`[appointment-action] Token validated successfully`);
    }

    if (action === "confirm") {
      // Check if already confirmed
      if (appt.status === "confirmed") {
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Appointment was already confirmed",
            appointment: appt 
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await supabase
        .from("appointments")
        .update({ 
          status: "confirmed",
          metadata: {
            ...appt.metadata,
            confirmed_at: new Date().toISOString(),
          }
        })
        .eq("id", appointmentId)
        .select()
        .single();

      if (error) throw error;

      // Log action
      try {
        await supabase.from("appointment_logs").insert({
          appointment_id: appointmentId,
          action: "confirmed",
          actor_id: userId || null,
          payload: { 
            reason,
            confirmed_at: new Date().toISOString(),
            via_token: !!token,
          },
        });
      } catch (logErr) {
        console.error("[appointment-action] log error:", logErr);
      }

      // Notification
      if (appt.receptionists?.user_id) {
        try {
          await supabase.from("notifications").insert({
            type: "appointment.confirmed",
            title: "Appointment Confirmed",
            body: `Appointment with ${appt.customer_name} has been confirmed`,
            message: `Appointment confirmed`,
            receptionist_id: appt.receptionist_id,
            user_id: appt.receptionists.user_id,
            metadata: { appointment_id: appointmentId },
            severity: "info",
            category: "appointments",
            priority: "normal",
          });
        } catch (notifErr) {
          console.error("[appointment-action] notification error:", notifErr);
        }
      }

      return new Response(
        JSON.stringify({ success: true, appointment: data }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } 
    
    if (action === "cancel") {
      // Check if already cancelled
      if (appt.status === "cancelled") {
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Appointment was already cancelled",
            appointment: appt 
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await supabase
        .from("appointments")
        .update({ 
          status: "cancelled",
          metadata: { 
            ...appt.metadata,
            cancelled_reason: reason || "Customer cancelled",
            cancelled_at: new Date().toISOString(),
            via_token: !!token,
          }
        })
        .eq("id", appointmentId)
        .select()
        .single();

      if (error) throw error;

      // Log action
      try {
        await supabase.from("appointment_logs").insert({
          appointment_id: appointmentId,
          action: "cancelled",
          actor_id: userId || null,
          payload: { 
            reason: reason || "Customer cancelled",
            cancelled_at: new Date().toISOString(),
            via_token: !!token,
          },
        });
      } catch (logErr) {
        console.error("[appointment-action] log error:", logErr);
      }

      // Notification
      if (appt.receptionists?.user_id) {
        try {
          await supabase.from("notifications").insert({
            type: "appointment.cancelled",
            title: "Appointment Cancelled",
            body: `Appointment with ${appt.customer_name} was cancelled${reason ? `: ${reason}` : ""}`,
            message: `Appointment cancelled`,
            receptionist_id: appt.receptionist_id,
            user_id: appt.receptionists.user_id,
            metadata: { appointment_id: appointmentId, reason },
            severity: "warning",
            category: "appointments",
            priority: "high",
          });
        } catch (notifErr) {
          console.error("[appointment-action] notification error:", notifErr);
        }
      }

      return new Response(
        JSON.stringify({ success: true, appointment: data }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "reschedule") {
      if (!new_start_time) {
        throw new Error("new_start_time required for reschedule");
      }

      // Calculate new end time based on service duration
      const { data: service } = await supabase
        .from("services")
        .select("duration_minutes")
        .eq("id", appt.service_id)
        .maybeSingle();

      const duration = service?.duration_minutes || 30;
      const newStart = new Date(new_start_time);
      const newEnd = new Date(newStart.getTime() + duration * 60000);

      const { data, error } = await supabase
        .from("appointments")
        .update({ 
          start_time: newStart.toISOString(),
          end_time: newEnd.toISOString(),
          metadata: {
            ...appt.metadata,
            rescheduled_from: appt.start_time,
            rescheduled_at: new Date().toISOString()
          }
        })
        .eq("id", appointmentId)
        .select()
        .single();

      if (error) throw error;

      // Log action
      try {
        await supabase.from("appointment_logs").insert({
          appointment_id: appointmentId,
          action: "rescheduled",
          actor_id: userId || null,
          payload: { 
            old_time: appt.start_time,
            new_time: newStart.toISOString(),
            reason,
            via_token: !!token,
          },
        });
      } catch (logErr) {
        console.error("[appointment-action] log error:", logErr);
      }

      // Notification
      if (appt.receptionists?.user_id) {
        try {
          await supabase.from("notifications").insert({
            type: "appointment.rescheduled",
            title: "Appointment Rescheduled",
            body: `Appointment with ${appt.customer_name} rescheduled to ${newStart.toLocaleString()}`,
            message: `Appointment rescheduled`,
            receptionist_id: appt.receptionist_id,
            user_id: appt.receptionists.user_id,
            metadata: { appointment_id: appointmentId, new_time: newStart.toISOString() },
            severity: "info",
            category: "appointments",
            priority: "normal",
          });
        } catch (notifErr) {
          console.error("[appointment-action] notification error:", notifErr);
        }
      }

      return new Response(
        JSON.stringify({ success: true, appointment: data }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error("Unknown action");
  } catch (err: any) {
    console.error("[appointment-action] error:", err);
    return new Response(
      JSON.stringify({ error: err.message || String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
