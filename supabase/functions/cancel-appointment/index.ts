import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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
    const { appointmentId, cancellationToken, reason } = body;

    console.log(`[cancel-appointment] Request for appointment ${appointmentId}`);

    if (!appointmentId || !cancellationToken) {
      throw new Error("appointmentId and cancellationToken are required");
    }

    // Fetch appointment with token validation
    const { data: appointment, error: fetchErr } = await supabase
      .from("appointments")
      .select("*")
      .eq("id", appointmentId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    if (!appointment) {
      return new Response(
        JSON.stringify({ error: "Appointment not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate cancellation token
    const storedToken = appointment.metadata?.cancellation_token;
    if (storedToken !== cancellationToken) {
      console.log(`[cancel-appointment] Invalid token for appointment ${appointmentId}`);
      return new Response(
        JSON.stringify({ error: "Invalid cancellation token" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already cancelled
    if (appointment.status === "cancelled") {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Appointment was already cancelled",
          appointment 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cancel the appointment
    const { data: updated, error: updateErr } = await supabase
      .from("appointments")
      .update({
        status: "cancelled",
        metadata: {
          ...appointment.metadata,
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason || "Customer cancelled",
        },
      })
      .eq("id", appointmentId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    console.log(`[cancel-appointment] Cancelled appointment ${appointmentId}`);

    // Log audit trail
    await supabase.from("appointment_logs").insert({
      appointment_id: appointmentId,
      action: "cancelled",
      actor_id: null,
      payload: {
        reason: reason || "Customer cancelled",
        cancelled_at: new Date().toISOString(),
        original_start: appointment.start_time,
      },
    });

    // Send notification to receptionist
    const { data: service } = await supabase
      .from("services")
      .select("name")
      .eq("id", appointment.service_id)
      .maybeSingle();

    await supabase.from("notifications").insert({
      type: "appointment.cancelled",
      title: `Appointment Cancelled: ${appointment.customer_name}`,
      body: `${service?.name || "Appointment"} scheduled for ${new Date(
        appointment.start_time
      ).toLocaleString()} has been cancelled.`,
      receptionist_id: appointment.receptionist_id,
      severity: "warning",
      category: "appointments",
      metadata: {
        appointment_id: appointmentId,
        customer_name: appointment.customer_name,
        reason: reason || "Customer cancelled",
      },
    });

    console.log(`[cancel-appointment] Notification sent`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Appointment cancelled successfully",
        appointment: updated,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("[cancel-appointment] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message || String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
