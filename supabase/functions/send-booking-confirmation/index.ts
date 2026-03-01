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

    const { appointmentId, recipientEmail, type = "confirmation" } = await req.json();

    if (!appointmentId || !recipientEmail) {
      throw new Error("appointmentId and recipientEmail are required");
    }

    // Fetch appointment details
    const { data: appointment, error: apptError } = await supabase
      .from("appointments")
      .select(`
        *,
        services (name, description, duration_minutes)
      `)
      .eq("id", appointmentId)
      .single();

    if (apptError || !appointment) {
      throw new Error("Appointment not found");
    }

    // Generate ICS calendar file content
    const startDate = new Date(appointment.start_time);
    const endDate = new Date(appointment.end_time);
    
    const formatICSDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//AI Receptionist//Booking//EN
BEGIN:VEVENT
UID:${appointmentId}@aireceptionist.com
DTSTAMP:${formatICSDate(new Date())}
DTSTART:${formatICSDate(startDate)}
DTEND:${formatICSDate(endDate)}
SUMMARY:${appointment.services?.name || appointment.service}
DESCRIPTION:Appointment booked via AI Receptionist
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

    // Base64 encode the ICS content for email attachment
    const icsBase64 = btoa(icsContent);

    // Get receptionist details for email
    const { data: receptionist } = await supabase
      .from("receptionists")
      .select("business_name, business_phone, name")
      .eq("id", appointment.receptionist_id)
      .single();

    // Generate manage booking URL
    const manageUrl = `${Deno.env.get("SUPABASE_URL")}/booking/${appointmentId}`;
    const cancelUrl = `${Deno.env.get("SUPABASE_URL")}/cancel/${appointmentId}?token=${appointment.cancellation_token}`;

    // Create HTML email content
    const emailHTML = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #D4AF37, #ECC571); color: #111; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; }
    .appointment-details { background: #f7f7f7; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e0e0e0; }
    .detail-row:last-child { border-bottom: none; }
    .button { display: inline-block; padding: 12px 30px; background: #D4AF37; color: #111; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 10px 5px; }
    .button-secondary { background: #f0f0f0; color: #666; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ ${type === 'confirmation' ? 'Booking Confirmed!' : 'Booking Reminder'}</h1>
      <p>${receptionist?.business_name || 'Our Business'}</p>
    </div>
    
    <div class="content">
      <p>Hi ${appointment.customer_name},</p>
      
      <p>${type === 'confirmation' 
        ? 'Your appointment has been successfully booked!' 
        : 'This is a friendly reminder about your upcoming appointment.'}</p>
      
      <div class="appointment-details">
        <h3>📋 Appointment Details</h3>
        <div class="detail-row">
          <strong>Service:</strong>
          <span>${appointment.services?.name || appointment.service}</span>
        </div>
        <div class="detail-row">
          <strong>Date:</strong>
          <span>${startDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
        <div class="detail-row">
          <strong>Time:</strong>
          <span>${startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
        </div>
        <div class="detail-row">
          <strong>Duration:</strong>
          <span>${appointment.services?.duration_minutes || 30} minutes</span>
        </div>
        ${appointment.customer_phone ? `
        <div class="detail-row">
          <strong>Your Phone:</strong>
          <span>${appointment.customer_phone}</span>
        </div>` : ''}
      </div>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${manageUrl}" class="button">📅 Add to Calendar</a>
        <a href="${cancelUrl}" class="button button-secondary">❌ Cancel Booking</a>
      </div>
      
      <p style="background: #fff3cd; padding: 15px; border-radius: 6px; border-left: 4px solid #D4AF37;">
        <strong>💡 Need to reschedule?</strong><br>
        Click "Cancel Booking" above and book a new time that works better for you.
      </p>
      
      ${receptionist?.business_phone ? `
      <p style="color: #666; font-size: 14px;">
        Questions? Contact us at ${receptionist.business_phone}
      </p>` : ''}
    </div>
    
    <div class="footer">
      <p>Powered by AI Receptionist</p>
      <p>This is an automated message. Please do not reply directly to this email.</p>
    </div>
  </div>
</body>
</html>
    `;

    // Send via Resend API (you'll need to add RESEND_API_KEY secret)
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    
    if (!resendApiKey) {
      console.warn("RESEND_API_KEY not configured, skipping email send");
      return new Response(
        JSON.stringify({ success: true, message: "Email service not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "bookings@aireceptionist.com",
        to: [recipientEmail],
        subject: type === 'confirmation' 
          ? `✅ Booking Confirmed - ${appointment.services?.name || appointment.service}`
          : `🔔 Reminder: ${appointment.services?.name || appointment.service} Tomorrow`,
        html: emailHTML,
        attachments: [{
          filename: "appointment.ics",
          content: icsBase64,
        }],
      }),
    });

    if (!emailResponse.ok) {
      const error = await emailResponse.text();
      throw new Error(`Email send failed: ${error}`);
    }

    console.log(`[send-booking-confirmation] Email sent to ${recipientEmail}`);

    return new Response(
      JSON.stringify({ success: true, message: "Email sent successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[send-booking-confirmation] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message || String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
