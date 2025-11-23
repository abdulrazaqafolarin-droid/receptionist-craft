import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { appointmentId, token, newStartTime } = await req.json();

    console.log("[reschedule-appointment] Request:", { appointmentId, newStartTime });

    if (!appointmentId || !token || !newStartTime) {
      throw new Error("Missing required fields");
    }

    // Fetch and validate appointment with token
    const { data: appointment, error: fetchErr } = await supabase
      .from("appointments")
      .select("*, services(*), receptionists(*)")
      .eq("id", appointmentId)
      .maybeSingle();

    if (fetchErr || !appointment) {
      throw new Error("Appointment not found");
    }

    // Validate token
    const storedToken = appointment.metadata?.confirmation_token || appointment.metadata?.cancellation_token;
    if (storedToken !== token) {
      throw new Error("Invalid token");
    }

    if (appointment.status === "cancelled") {
      throw new Error("Cannot reschedule cancelled appointment");
    }

    // Calculate new times
    const service = appointment.services;
    const duration = service?.duration_minutes || 30;
    const bufferBefore = service?.buffer_before_minutes || 5;
    const bufferAfter = service?.buffer_after_minutes || 5;

    const newStart = new Date(newStartTime);
    const newEnd = new Date(newStart.getTime() + duration * 60000);
    const startWithBuffer = new Date(newStart.getTime() - bufferBefore * 60000);
    const endWithBuffer = new Date(newEnd.getTime() + bufferAfter * 60000);

    // Check for conflicts
    const { data: conflicts } = await supabase
      .from("appointments")
      .select("id, start_time, end_time")
      .eq("receptionist_id", appointment.receptionist_id)
      .neq("id", appointmentId)
      .neq("status", "cancelled")
      .or(`start_time.lt.${endWithBuffer.toISOString()},end_time.gt.${startWithBuffer.toISOString()}`);

    const hasConflict = (conflicts || []).some((appt: any) => {
      const apptStart = new Date(appt.start_time);
      const apptEnd = new Date(appt.end_time);
      return !(endWithBuffer <= apptStart || startWithBuffer >= apptEnd);
    });

    if (hasConflict) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Selected time slot is not available" 
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update appointment
    const { data: updated, error: updateErr } = await supabase
      .from("appointments")
      .update({
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString(),
        metadata: {
          ...appointment.metadata,
          rescheduled_at: new Date().toISOString(),
          original_start_time: appointment.start_time,
        },
      })
      .eq("id", appointmentId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // Log the reschedule
    await supabase.from("appointment_logs").insert({
      appointment_id: appointmentId,
      action: "rescheduled",
      payload: {
        old_time: appointment.start_time,
        new_time: newStartTime,
      },
    });

    // Send notification to business
    await supabase.from("notifications").insert({
      type: "appointment.rescheduled",
      title: `Appointment Rescheduled: ${appointment.customer_name}`,
      body: `${appointment.service} rescheduled to ${newStart.toLocaleString()}`,
      message: "Customer rescheduled their appointment",
      receptionist_id: appointment.receptionist_id,
      user_id: appointment.receptionists.user_id,
      severity: "info",
      category: "appointments",
      priority: "normal",
      metadata: {
        appointment_id: appointmentId,
        old_time: appointment.start_time,
        new_time: newStartTime,
      },
    });

    // Send confirmation email if customer has email
    if (appointment.customer_email) {
      await supabase.functions.invoke("send-appointment-email", {
        body: {
          type: "confirmation",
          to: appointment.customer_email,
          customerName: appointment.customer_name,
          serviceName: appointment.service,
          startTime: newStart.toISOString(),
          endTime: newEnd.toISOString(),
          businessName: appointment.receptionists.business_name,
          businessPhone: appointment.receptionists.business_phone,
          businessAddress: appointment.receptionists.address,
          confirmationToken: appointment.metadata.confirmation_token,
          cancellationToken: appointment.metadata.cancellation_token,
          notes: "Your appointment has been rescheduled.",
        },
      });
    }

    console.log("[reschedule-appointment] Success:", updated.id);

    return new Response(
      JSON.stringify({ success: true, appointment: updated }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[reschedule-appointment] Error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || "Failed to reschedule" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
