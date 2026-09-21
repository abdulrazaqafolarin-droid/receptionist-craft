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
      (Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "")
    );

    const body = await req.json().catch(() => ({}));
    const { appointmentId, confirmationToken } = body;

    console.log(`[confirm-appointment] Request for appointment ${appointmentId}`);

    if (!appointmentId || !confirmationToken) {
      throw new Error("appointmentId and confirmationToken are required");
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

    // Validate confirmation token (check column first, then metadata)
    const storedToken = appointment.confirmation_token || appointment.metadata?.confirmation_token;
    if (storedToken !== confirmationToken) {
      console.log(`[confirm-appointment] Invalid token for appointment ${appointmentId}`);
      return new Response(
        JSON.stringify({ error: "Invalid confirmation token" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already confirmed
    if (appointment.status === "confirmed") {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Appointment was already confirmed",
          appointment 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if cancelled
    if (appointment.status === "cancelled") {
      return new Response(
        JSON.stringify({ error: "Cannot confirm a cancelled appointment" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Confirm the appointment
    const { data: updated, error: updateErr } = await supabase
      .from("appointments")
      .update({
        status: "confirmed",
        metadata: {
          ...appointment.metadata,
          confirmed_at: new Date().toISOString(),
        },
      })
      .eq("id", appointmentId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    console.log(`[confirm-appointment] Confirmed appointment ${appointmentId}`);

    // Log audit trail
    await supabase.from("appointment_logs").insert({
      appointment_id: appointmentId,
      action: "confirmed",
      actor_id: null,
      payload: {
        confirmed_at: new Date().toISOString(),
      },
    });

    // Send notification
    const { data: service } = await supabase
      .from("services")
      .select("name")
      .eq("id", appointment.service_id)
      .maybeSingle();

    await supabase.from("notifications").insert({
      type: "appointment.confirmed",
      title: `Appointment Confirmed: ${appointment.customer_name}`,
      body: `${service?.name || "Appointment"} for ${new Date(
        appointment.start_time
      ).toLocaleString()} has been confirmed.`,
      receptionist_id: appointment.receptionist_id,
      severity: "info",
      category: "appointments",
      metadata: {
        appointment_id: appointmentId,
        customer_name: appointment.customer_name,
      },
    });

    console.log(`[confirm-appointment] Notification sent`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Appointment confirmed successfully",
        appointment: updated,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("[confirm-appointment] Error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
