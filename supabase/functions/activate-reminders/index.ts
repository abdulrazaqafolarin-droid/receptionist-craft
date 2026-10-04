/**
 * SUPERSEDED by appointment-reminder-runner (24h + 1h windows, dedupe via
 * appointment_logs, owner notify + customer email). Kept deployed but
 * unwired — do not add new callers. Remove only via dashboard + migration.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "")
    );

    console.log("[activate-reminders] Checking for upcoming appointments...");

    // Get appointments in the next 24 hours that are booked
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const { data: appointments, error } = await supabase
      .from("appointments")
      .select(`
        *,
        services (name, duration_minutes),
        receptionists (business_name, name)
      `)
      .eq("status", "booked")
      .gte("start_time", now.toISOString())
      .lte("start_time", tomorrow.toISOString());

    if (error) throw error;

    console.log(`[activate-reminders] Found ${appointments?.length || 0} appointments`);

    let remindersSent = 0;

    for (const apt of appointments || []) {
      const appointmentTime = new Date(apt.start_time);
      const hoursUntil = (appointmentTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      // Send reminder if appointment is 24 hours away (±1 hour window)
      if (hoursUntil >= 23 && hoursUntil <= 25 && apt.customer_email) {
        try {
          // Send reminder email
          await supabase.functions.invoke("send-booking-email", {
            body: {
              appointmentId: apt.id,
              isReminder: true,
            },
          });

          // Log the reminder
          await supabase.from("appointment_logs").insert({
            appointment_id: apt.id,
            action: "reminder_sent",
            payload: {
              reminder_type: "24h",
              sent_at: now.toISOString(),
            },
          });

          remindersSent++;
          console.log(`[activate-reminders] Sent reminder for appointment ${apt.id}`);
        } catch (err) {
          console.error(`[activate-reminders] Failed to send reminder for ${apt.id}:`, err);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        checked: appointments?.length || 0,
        remindersSent,
        message: `Checked ${appointments?.length || 0} appointments, sent ${remindersSent} reminders`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[activate-reminders] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
