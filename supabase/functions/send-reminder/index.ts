import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Resend API client
class Resend {
  private apiKey: string;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  get emails() {
    return {
      send: async (options: {
        from: string;
        to: string[];
        subject: string;
        html: string;
      }) => {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(options)
        });
        
        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Resend API error: ${error}`);
        }
        
        return await response.json();
      }
    };
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const resend = new Resend(RESEND_API_KEY);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
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

    if (!appointment.customer_email) {
      console.log(`No email for appointment ${appointmentId}, skipping reminder`);
      return new Response(
        JSON.stringify({ success: false, reason: "No customer email" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    // Generate confirmation/cancellation tokens (from appointment metadata)
    const confirmToken = appointment.metadata?.confirmation_token || "";
    const cancelToken = appointment.metadata?.cancellation_token || "";
    
    const baseUrl = Deno.env.get("SUPABASE_URL")?.replace('/rest/v1', '') || "";
    const confirmUrl = `${baseUrl}/appointments/confirm?token=${confirmToken}`;
    const cancelUrl = `${baseUrl}/appointments/cancel?token=${cancelToken}`;

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
    .appointment-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea; }
    .button { display: inline-block; padding: 12px 24px; margin: 10px 5px; text-decoration: none; border-radius: 6px; font-weight: bold; }
    .btn-confirm { background: #10b981; color: white; }
    .btn-cancel { background: #ef4444; color: white; }
    .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📅 Appointment Reminder</h1>
      <p>${receptionist?.business_name || 'Your Business'}</p>
    </div>
    <div class="content">
      <p>Hi <strong>${appointment.customer_name}</strong>,</p>
      
      <p>This is a friendly reminder about your upcoming appointment:</p>
      
      <div class="appointment-details">
        <p><strong>📋 Service:</strong> ${appointment.service}</p>
        <p><strong>📅 Date:</strong> ${formattedDate}</p>
        <p><strong>🕐 Time:</strong> ${formattedTime}</p>
        ${receptionist?.address ? `<p><strong>📍 Location:</strong> ${receptionist.address}</p>` : ''}
        ${receptionist?.business_phone ? `<p><strong>📞 Phone:</strong> ${receptionist.business_phone}</p>` : ''}
      </div>

      <p style="text-align: center; margin: 30px 0;">
        <a href="${confirmUrl}" class="button btn-confirm">✅ Confirm Appointment</a>
        <a href="${cancelUrl}" class="button btn-cancel">❌ Cancel Appointment</a>
      </p>

      <p style="color: #666; font-size: 14px;">
        If you need to reschedule, please contact us at ${receptionist?.business_phone || 'the business'}.
      </p>

      <div class="footer">
        <p>This is an automated reminder from ${receptionist?.business_name || 'AI Receptionist'}</p>
        <p>Your appointment ID: ${appointment.id}</p>
      </div>
    </div>
  </div>
</body>
</html>
    `;

    const emailResponse = await resend.emails.send({
      from: `${receptionist?.business_name || 'AI Receptionist'} <reminders@resend.dev>`,
      to: [appointment.customer_email],
      subject: `Reminder: Your ${appointment.service} appointment tomorrow`,
      html: emailHtml,
    });

    console.log("Reminder email sent:", emailResponse);

    // Log the reminder
    await supabase.from("appointment_logs").insert({
      appointment_id: appointmentId,
      action: "reminder_sent",
      actor_id: null,
      payload: {
        email: appointment.customer_email,
        sent_at: new Date().toISOString(),
        resend_id: emailResponse.id
      }
    });

    // Create notification for business owner
    await supabase.from("notifications").insert({
      type: "appointment.reminder",
      title: "Reminder Sent",
      body: `Appointment reminder sent to ${appointment.customer_name}`,
      receptionist_id: appointment.receptionist_id,
      user_id: receptionist?.user_id,
      severity: "info",
      metadata: { appointment_id: appointmentId }
    });

    return new Response(
      JSON.stringify({ success: true, emailId: emailResponse.id }),
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
