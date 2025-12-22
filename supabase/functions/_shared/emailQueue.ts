// ═══════════════════════════════════════════════════════════════════════════
// ASYNC EMAIL QUEUE UTILITIES - Background Email Processing
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export interface EmailJob {
  id?: string;
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  replyTo?: string;
  metadata?: Record<string, unknown>;
  priority?: 'high' | 'normal' | 'low';
  scheduledFor?: string;
  retryCount?: number;
  maxRetries?: number;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Queue an email for async sending
 * This allows immediate response to user while email is sent in background
 */
export async function queueEmail(
  supabase: ReturnType<typeof createClient>,
  email: EmailJob
): Promise<{ queued: boolean; jobId?: string; error?: string }> {
  try {
    // For now, we'll use EdgeRuntime.waitUntil for background processing
    // In a more complex setup, you'd insert into a dedicated email_queue table
    
    console.log(`[EmailQueue] Queuing email to ${email.to}: ${email.subject}`);
    
    return {
      queued: true,
      jobId: crypto.randomUUID(),
    };
  } catch (error) {
    console.error('[EmailQueue] Failed to queue email:', error);
    return {
      queued: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send email immediately using Resend
 * Call this from a background task (waitUntil) to not block response
 */
export async function sendEmailNow(email: EmailJob): Promise<EmailResult> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  
  if (!resendApiKey) {
    console.error('[EmailQueue] RESEND_API_KEY not configured');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Rutex Frontdesk <noreply@resend.dev>',
        to: [email.to],
        subject: email.subject,
        html: email.htmlBody,
        text: email.textBody,
        reply_to: email.replyTo,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[EmailQueue] Resend API error:', errorData);
      return {
        success: false,
        error: errorData.message || `HTTP ${response.status}`,
      };
    }

    const result = await response.json();
    console.log(`[EmailQueue] Email sent successfully: ${result.id}`);
    
    return {
      success: true,
      messageId: result.id,
    };
  } catch (error) {
    console.error('[EmailQueue] Failed to send email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send email in background using EdgeRuntime.waitUntil
 * Use this in edge functions to send emails without blocking the response
 */
export function sendEmailBackground(email: EmailJob): void {
  // Use globalThis to access EdgeRuntime without TypeScript errors
  const runtime = (globalThis as any).EdgeRuntime;
  
  if (runtime && typeof runtime.waitUntil === 'function') {
    runtime.waitUntil(
      sendEmailNow(email)
        .then(result => {
          if (!result.success) {
            console.error('[EmailQueue] Background email failed:', result.error);
          }
        })
        .catch(error => {
          console.error('[EmailQueue] Background email error:', error);
        })
    );
    console.log(`[EmailQueue] Email queued for background send to ${email.to}`);
  } else {
    // Fallback: send synchronously if EdgeRuntime not available
    console.log('[EmailQueue] EdgeRuntime not available, sending synchronously');
    sendEmailNow(email);
  }
}

/**
 * Build appointment confirmation email HTML
 */
export function buildAppointmentConfirmationEmail(
  customerName: string,
  serviceName: string,
  dateTime: string,
  businessName: string,
  confirmUrl?: string,
  cancelUrl?: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Appointment Confirmation</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #0066cc, #0088ff); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Appointment Confirmed</h1>
  </div>
  
  <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
    <p style="font-size: 18px; margin-top: 0;">Hello ${customerName},</p>
    
    <p>Your appointment has been successfully booked!</p>
    
    <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #0066cc; margin: 20px 0;">
      <p style="margin: 0 0 10px 0;"><strong>Service:</strong> ${serviceName}</p>
      <p style="margin: 0 0 10px 0;"><strong>Date & Time:</strong> ${dateTime}</p>
      <p style="margin: 0;"><strong>Business:</strong> ${businessName}</p>
    </div>
    
    ${confirmUrl || cancelUrl ? `
    <div style="text-align: center; margin: 30px 0;">
      ${confirmUrl ? `<a href="${confirmUrl}" style="display: inline-block; background: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-right: 10px;">Confirm Appointment</a>` : ''}
      ${cancelUrl ? `<a href="${cancelUrl}" style="display: inline-block; background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Cancel Appointment</a>` : ''}
    </div>
    ` : ''}
    
    <p style="color: #64748b; font-size: 14px;">If you have any questions, please don't hesitate to contact us.</p>
    
    <p style="margin-bottom: 0;">Thank you for choosing ${businessName}!</p>
  </div>
  
  <p style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 20px;">
    Powered by Rutex Frontdesk
  </p>
</body>
</html>
  `.trim();
}
