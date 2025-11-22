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
    const body = await req.json().catch(() => ({}));
    const { 
      action, 
      appointmentId, 
      userId = null, 
      reason = null, 
      newStartTime = null, 
      newEndTime = null 
    } = body;

    if (!action || !appointmentId) {
      return new Response(
        JSON.stringify({ error: "action and appointmentId required" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["confirm", "cancel", "reschedule"].includes(action)) {
      return new Response(
        JSON.stringify({ error: "Invalid action. Must be: confirm, cancel, or reschedule" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load appointment
    const { data: appointment, error: apptErr } = await supabase
      .from("appointments")
      .select("*")
      .eq("id", appointmentId)
      .maybeSingle();

    if (apptErr || !appointment) {
      return new Response(
        JSON.stringify({ error: "Appointment not found" }), 
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[appointment-action] ${action} for appointment ${appointmentId}`);

    let updatePayload: any = { updated_at: new Date().toISOString() };

    if (action === "confirm") {
      updatePayload.status = "confirmed";
    }

    if (action === "cancel") {
      updatePayload.status = "cancelled";
    }

    if (action === "reschedule") {
      if (!newStartTime || !newEndTime) {
        return new Response(
          JSON.stringify({ error: "newStartTime and newEndTime required for reschedule" }), 
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check conflicts for new time
      const { data: conflicts, error: conflictErr } = await supabase
        .from("appointments")
        .select("id, start_time, end_time")
        .eq("receptionist_id", appointment.receptionist_id)
        .in("status", ["booked", "confirmed"])
        .neq("id", appointmentId)
        .or(`start_time.lt.${newEndTime},end_time.gt.${newStartTime}`);

      if (conflictErr) {
        console.error("[appointment-action] Conflict check error:", conflictErr);
        throw conflictErr;
      }

      const hasConflict = (conflicts || []).some((appt: any) => {
        const apptStart = new Date(appt.start_time);
        const apptEnd = new Date(appt.end_time);
        const newStart = new Date(newStartTime);
        const newEnd = new Date(newEndTime);
        return !(newEnd <= apptStart || newStart >= apptEnd);
      });

      if (hasConflict) {
        return new Response(
          JSON.stringify({ error: "New time slot unavailable", conflicts }), 
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      updatePayload.start_time = newStartTime;
      updatePayload.end_time = newEndTime;
      updatePayload.status = "booked";
    }

    // Update appointment
    const { error: updErr } = await supabase
      .from("appointments")
      .update(updatePayload)
      .eq("id", appointmentId);

    if (updErr) throw updErr;

    // Log audit event
    await supabase.from("appointment_logs").insert({
      appointment_id: appointmentId,
      action,
      actor_id: userId,
      payload: {
        reason,
        newStartTime,
        newEndTime,
        previousStatus: appointment.status,
        newStatus: updatePayload.status || appointment.status,
      },
    });

    // Create notification
    const notificationTitle = action === "confirm" 
      ? `Appointment Confirmed: ${appointment.customer_name}`
      : action === "cancel"
      ? `Appointment Cancelled: ${appointment.customer_name}`
      : `Appointment Rescheduled: ${appointment.customer_name}`;

    const notificationBody = action === "reschedule"
      ? `Rescheduled to ${new Date(newStartTime).toLocaleString()}`
      : `${action} at ${new Date(appointment.start_time).toLocaleString()}`;

    await supabase.from("notifications").insert({
      type: `appointment.${action}`,
      title: notificationTitle,
      body: notificationBody,
      receptionist_id: appointment.receptionist_id,
      severity: action === "cancel" ? "warning" : "info",
      category: "appointments",
      metadata: {
        appointment_id: appointmentId,
        action,
        reason,
      },
    });

    console.log(`[appointment-action] Success: ${action} completed`);

    return new Response(
      JSON.stringify({ success: true, action, appointmentId }), 
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[appointment-action] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }), 
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
