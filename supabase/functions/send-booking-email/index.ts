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
    const { appointmentId } = await req.json();

    if (!appointmentId) {
      throw new Error("appointmentId is required");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "")
    );

    // Fetch appointment with related data
    const { data: appointment, error: aptError } = await supabase
      .from("appointments")
      .select(`
        *,
        services (name, duration_minutes, description),
        receptionists (business_name, business_phone, name)
      `)
      .eq("id", appointmentId)
      .single();

    if (aptError || !appointment) {
      throw new Error("Appointment not found");
    }

    // Only send if customer has email
    if (!appointment.customer_email) {
      return new Response(
        JSON.stringify({ success: true, message: "No email provided, skipping" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.warn("RESEND_API_KEY not configured, email not sent");
      return new Response(
        JSON.stringify({ success: true, message: "Email service not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const startDate = new Date(appointment.start_time);
    const endDate = new Date(appointment.end_time);

    // Generate ICS calendar file
    const formatICSDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//AI Receptionist//Booking//EN
BEGIN:VEVENT
UID:${appointment.id}@aireceptionist.com
DTSTAMP:${formatICSDate(new Date())}
DTSTART:${formatICSDate(startDate)}
DTEND:${formatICSDate(endDate)}
SUMMARY:${appointment.services?.name || appointment.service}
DESCRIPTION:Appointment with ${appointment.receptionists?.business_name || 'Business'}
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

    const manageUrl = `${Deno.env.get("SUPABASE_URL")?.replace('/rest/v1', '')}/manage-booking/${appointment.id}`;

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; }
    .detail-row { margin: 15px 0; padding: 15px; background: #f8f9fa; border-radius: 6px; }
    .detail-label { font-weight: 600; color: #666; font-size: 12px; text-transform: uppercase; }
    .detail-value { font-size: 16px; color: #333; margin-top: 5px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 5px; }
    .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">✅ Appointment Confirmed!</h1>
      <p style="margin: 10px 0 0 0;">Your booking with ${appointment.receptionists?.business_name || 'us'} has been confirmed</p>
    </div>
    
    <div class="content">
      <h2>Hi ${appointment.customer_name}!</h2>
      <p>Your appointment has been successfully booked. Here are the details:</p>
      
      <div class="detail-row">
        <div class="detail-label">Service</div>
        <div class="detail-value">${appointment.services?.name || appointment.service}</div>
      </div>
      
      <div class="detail-row">
        <div class="detail-label">Date & Time</div>
        <div class="detail-value">
          ${startDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}<br/>
          ${startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - ${endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </div>
      </div>
      
      ${appointment.services?.duration_minutes ? `
      <div class="detail-row">
        <div class="detail-label">Duration</div>
        <div class="detail-value">${appointment.services.duration_minutes} minutes</div>
      </div>
      ` : ''}
      
      ${appointment.notes ? `
      <div class="detail-row">
        <div class="detail-label">Notes</div>
        <div class="detail-value">${appointment.notes}</div>
      </div>
      ` : ''}
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${manageUrl}" class="button">Manage Appointment</a>
      </div>
      
      <p style="font-size: 14px; color: #666;">
        Use the link above to view, reschedule, or cancel your appointment.
      </p>
      
      ${appointment.receptionists?.business_phone ? `
      <p style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 14px;">
        <strong>Questions?</strong> Call us at ${appointment.receptionists.business_phone}
      </p>
      ` : ''}
    </div>
    
    <div class="footer">
      <p>This confirmation was sent by ${appointment.receptionists?.business_name || 'AI Receptionist'}</p>
      <p style="font-size: 12px; color: #999;">Please do not reply to this email</p>
    </div>
  </div>
</body>
</html>`;

    // Send email via Resend
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "AI Receptionist <appointments@resend.dev>",
        to: [appointment.customer_email],
        subject: `Appointment Confirmed - ${appointment.services?.name || appointment.service}`,
        html: emailHtml,
        attachments: [
          {
            filename: "appointment.ics",
            content: btoa(icsContent),
          },
        ],
      }),
    });

    if (!emailResponse.ok) {
      const error = await emailResponse.text();
      console.error("Resend API error:", error);
      throw new Error("Failed to send email");
    }

    const result = await emailResponse.json();
    console.log("Email sent successfully:", result);

    return new Response(
      JSON.stringify({ success: true, emailId: result.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in send-booking-email:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
