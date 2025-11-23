const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generateConfirmationEmail(data: any) {
  const formattedDate = new Date(data.startTime).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  
  const formattedTime = new Date(data.startTime).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
  
  const endTimeFormatted = new Date(data.endTime).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f6f9fc; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; padding: 40px; }
        h1 { color: #333; font-size: 28px; text-align: center; margin-bottom: 30px; }
        p { color: #333; font-size: 16px; line-height: 26px; margin: 16px 0; }
        .details-box { background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; padding: 24px; margin: 24px 0; }
        .details-box p { color: #475569; font-size: 15px; margin: 8px 0; }
        .button { display: inline-block; background-color: #0ea5e9; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: bold; margin: 20px auto; text-align: center; }
        .footer { color: #94a3b8; font-size: 12px; text-align: center; margin-top: 32px; }
        .small-text { color: #64748b; font-size: 14px; text-align: center; margin: 16px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Appointment Confirmed! ✅</h1>
        <p>Hi ${data.customerName},</p>
        <p>Your appointment has been successfully booked with ${data.businessName}.</p>
        
        <div class="details-box">
          <p><strong>Service:</strong> ${data.serviceName}</p>
          <p><strong>Date:</strong> ${formattedDate}</p>
          <p><strong>Time:</strong> ${formattedTime} - ${endTimeFormatted}</p>
          ${data.businessPhone ? `<p><strong>Phone:</strong> ${data.businessPhone}</p>` : ''}
          ${data.businessAddress ? `<p><strong>Location:</strong> ${data.businessAddress}</p>` : ''}
          ${data.notes ? `<p><strong>Notes:</strong> ${data.notes}</p>` : ''}
        </div>
        
        <div style="text-align: center;">
          <a href="${data.confirmationUrl}" class="button">Confirm Appointment</a>
        </div>
        
        <p>You'll receive a reminder 24 hours before your appointment.</p>
        
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 32px 0;">
        
        <p class="small-text">
          Need to make changes? 
          <a href="${data.confirmationUrl}" style="color: #0ea5e9;">Reschedule</a> or 
          <a href="${data.cancellationUrl}" style="color: #0ea5e9;">Cancel</a>
        </p>
        
        <p class="footer">
          ${data.businessName}<br>
          This is an automated email, please do not reply.
        </p>
      </div>
    </body>
    </html>
  `;
}

function generateReminderEmail(data: any) {
  const formattedDate = new Date(data.startTime).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  
  const formattedTime = new Date(data.startTime).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f6f9fc; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; padding: 40px; }
        h1 { color: #333; font-size: 28px; text-align: center; margin-bottom: 30px; }
        p { color: #333; font-size: 16px; line-height: 26px; margin: 16px 0; }
        .details-box { background-color: #fef3c7; border-radius: 8px; border: 1px solid #fbbf24; padding: 24px; margin: 24px 0; }
        .details-box p { color: #78350f; font-size: 15px; margin: 8px 0; }
        .footer { color: #94a3b8; font-size: 12px; text-align: center; margin-top: 32px; }
        .small-text { color: #64748b; font-size: 14px; text-align: center; margin: 16px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Appointment Reminder 🔔</h1>
        <p>Hi ${data.customerName},</p>
        <p>This is a friendly reminder about your upcoming appointment with ${data.businessName}.</p>
        
        <div class="details-box">
          <p><strong>Service:</strong> ${data.serviceName}</p>
          <p><strong>Date:</strong> ${formattedDate}</p>
          <p><strong>Time:</strong> ${formattedTime}</p>
          ${data.businessPhone ? `<p><strong>Phone:</strong> ${data.businessPhone}</p>` : ''}
          ${data.businessAddress ? `<p><strong>Location:</strong> ${data.businessAddress}</p>` : ''}
        </div>
        
        <p>We're looking forward to seeing you! Please arrive a few minutes early.</p>
        
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 32px 0;">
        
        <p class="small-text">
          Need to make changes? 
          <a href="${data.confirmationUrl}" style="color: #0ea5e9;">Reschedule</a> or 
          <a href="${data.cancellationUrl}" style="color: #0ea5e9;">Cancel</a>
        </p>
        
        <p class="footer">
          ${data.businessName}<br>
          This is an automated reminder email.
        </p>
      </div>
    </body>
    </html>
  `;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      type,
      to,
      customerName,
      serviceName,
      startTime,
      endTime,
      businessName,
      businessPhone,
      businessAddress,
      confirmationToken,
      cancellationToken,
      notes,
    } = await req.json();

    console.log(`[send-appointment-email] Sending ${type} email to ${to}`);

    if (!to || !customerName || !serviceName || !startTime) {
      throw new Error('Missing required fields');
    }

    const baseUrl = Deno.env.get('SUPABASE_URL')?.replace('/functions/v1', '') || 
                    'https://xhihzexkqezhpwsryxqv.supabase.co';
    
    const confirmationUrl = `${baseUrl}/reschedule-appointment?token=${confirmationToken}`;
    const cancellationUrl = `${baseUrl}/cancel-appointment?token=${cancellationToken}`;

    const emailData = {
      customerName,
      serviceName,
      startTime,
      endTime,
      businessName,
      businessPhone,
      businessAddress,
      confirmationUrl,
      cancellationUrl,
      notes,
    };

    let html: string;
    let subject: string;

    if (type === 'confirmation') {
      html = generateConfirmationEmail(emailData);
      subject = `Appointment Confirmed with ${businessName}`;
    } else if (type === 'reminder') {
      html = generateReminderEmail(emailData);
      subject = `Reminder: Appointment with ${businessName} Tomorrow`;
    } else {
      throw new Error('Invalid email type');
    }

    // Send email via Resend API
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY not configured');
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${businessName} <onboarding@resend.dev>`,
        to: [to],
        subject,
        html,
      }),
    });

    if (!resendResponse.ok) {
      const error = await resendResponse.text();
      console.error('[send-appointment-email] Resend API error:', error);
      throw new Error(`Resend API error: ${error}`);
    }

    const data = await resendResponse.json();
    console.log('[send-appointment-email] Email sent successfully:', data);

    return new Response(
      JSON.stringify({ success: true, data }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('[send-appointment-email] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Failed to send email' 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
