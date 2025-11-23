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

    console.log("[send-reminders-cron] Starting reminder check");

    // Find appointments 24 hours from now
    const now = new Date();
    const windowStart = new Date(now.getTime() + 23.5 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 24.5 * 60 * 60 * 1000);

    const { data: appointments, error: fetchErr } = await supabase
      .from("appointments")
      .select("*, services(*), receptionists(*)")
      .eq("status", "booked")
      .gte("start_time", windowStart.toISOString())
      .lte("start_time", windowEnd.toISOString());

    if (fetchErr) {
      console.error("[send-reminders-cron] Fetch error:", fetchErr);
      throw fetchErr;
    }

    console.log(`[send-reminders-cron] Found ${appointments?.length || 0} appointments`);

    let sentCount = 0;
    let errorCount = 0;

    for (const appt of appointments || []) {
      // Check if reminder already sent
      const alreadySent = appt.metadata?.reminder_sent_at;
      if (alreadySent) {
        console.log(`[send-reminders-cron] Reminder already sent for ${appt.id}`);
        continue;
      }

      // Only send if customer has email
      if (!appt.customer_email) {
        console.log(`[send-reminders-cron] No email for ${appt.id}`);
        continue;
      }

      try {
        // Send reminder email
        await supabase.functions.invoke("send-appointment-email", {
          body: {
            type: "reminder",
            to: appt.customer_email,
            customerName: appt.customer_name,
            serviceName: appt.service,
            startTime: appt.start_time,
            endTime: appt.end_time,
            businessName: appt.receptionists.business_name,
            businessPhone: appt.receptionists.business_phone,
            businessAddress: appt.receptionists.address,
            confirmationToken: appt.metadata?.confirmation_token,
            cancellationToken: appt.metadata?.cancellation_token,
          },
        });

        // Mark reminder as sent
        await supabase
          .from("appointments")
          .update({
            metadata: {
              ...appt.metadata,
              reminder_sent_at: new Date().toISOString(),
            },
          })
          .eq("id", appt.id);

        // Log the reminder
        await supabase.from("appointment_logs").insert({
          appointment_id: appt.id,
          action: "reminder_sent",
          payload: {
            email: appt.customer_email,
            sent_at: new Date().toISOString(),
          },
        });

        // Create notification for business
        await supabase.from("notifications").insert({
          type: "appointment.reminder",
          title: `Reminder Sent: ${appt.customer_name}`,
          body: `24-hour reminder sent for ${appt.service}`,
          message: "Appointment reminder email delivered",
          receptionist_id: appt.receptionist_id,
          user_id: appt.receptionists.user_id,
          severity: "info",
          category: "appointments",
          priority: "low",
          metadata: {
            appointment_id: appt.id,
          },
        });

        sentCount++;
        console.log(`[send-reminders-cron] Reminder sent for ${appt.id}`);
      } catch (err: any) {
        console.error(`[send-reminders-cron] Error sending reminder for ${appt.id}:`, err);
        errorCount++;
      }
    }

    console.log(`[send-reminders-cron] Complete: ${sentCount} sent, ${errorCount} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        checked: appointments?.length || 0,
        sent: sentCount,
        errors: errorCount,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[send-reminders-cron] Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
