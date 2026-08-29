import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { appointmentId } = await req.json();

    if (!appointmentId) {
      throw new Error("Appointment ID is required");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "")
    );

    // Fetch appointment details
    const { data: appointment, error: aptErr } = await supabase
      .from("appointments")
      .select(`
        *,
        receptionists (
          name,
          business_name,
          business_phone,
          address
        )
      `)
      .eq("id", appointmentId)
      .maybeSingle();

    if (aptErr || !appointment) {
      throw new Error("Appointment not found");
    }

    const receptionist = appointment.receptionists;
    const appointmentDate = new Date(appointment.start_time);
    const formattedDate = appointmentDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const formattedTime = appointmentDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });

    // Log the reminder
    await supabase.from("appointment_logs").insert({
      appointment_id: appointmentId,
      action: "reminder_sent",
      actor_id: null,
      payload: {
        customer_name: appointment.customer_name,
        sent_at: new Date().toISOString(),
        method: "in_app_notification"
      }
    });

    // Create notification for business owner
    const { error: notifError } = await supabase.from("notifications").insert({
      type: "appointment.reminder",
      title: "Upcoming Appointment Reminder",
      message: `Reminder: ${appointment.customer_name} has an appointment for ${appointment.service} on ${formattedDate} at ${formattedTime}`,
      body: `Appointment with ${appointment.customer_name} is coming up soon`,
      receptionist_id: appointment.receptionist_id,
      user_id: receptionist?.user_id,
      severity: "info",
      category: "appointment",
      metadata: { 
        appointment_id: appointmentId,
        customer_name: appointment.customer_name,
        service: appointment.service,
        start_time: appointment.start_time
      }
    });

    if (notifError) {
      console.error("Error creating notification:", notifError);
    }

    return new Response(
      JSON.stringify({ success: true, notification_sent: true }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Send reminder error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
