/**
 * Generic Email Sender
 *
 * Sends emails via Resend API. Used by all modules that need
 * to deliver content via email (responder, campaigns, surveys, etc.).
 *
 * Checks connector tier before sending:
 *   Tier 1 (connected): sends automatically
 *   Tier 2 (configured): returns draft for manual send
 *   Tier 3 (not configured): returns "connect email to send"
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from_name?: string;
  reply_to?: string;
}

export interface EmailSendResult {
  success: boolean;
  tier: 1 | 2 | 3;
  message_id?: string;
  error?: string;
  // For Tier 2: the draft ready to send manually
  draft?: {
    subject: string;
    body: string;
    to: string;
  };
  // For Tier 3: what to connect
  connect_prompt?: string;
}

/**
 * Send an email via the configured connector.
 * Returns the tier-aware result.
 */
export async function sendEmail(
  supabase: SupabaseClient,
  userId: string,
  receptionistId: string,
  message: EmailMessage,
): Promise<EmailSendResult> {
  // Check connector tier
  const { data: connector } = await supabase
    .from("connectors")
    .select("status, current_tier, config_json")
    .eq("user_id", userId)
    .eq("connector_key", "gmail")
    .maybeSingle();

  // Also check Outlook
  const { data: outlookConnector } = await supabase
    .from("connectors")
    .select("status, current_tier, config_json")
    .eq("user_id", userId)
    .eq("connector_key", "outlook")
    .maybeSingle();

  // Also check custom SMTP
  const { data: smtpConnector } = await supabase
    .from("connectors")
    .select("status, current_tier, config_json")
    .eq("user_id", userId)
    .eq("connector_key", "smtp_custom")
    .maybeSingle();

  // Use the best available connector
  const activeConnector =
    connector?.status === "connected" ? connector :
    outlookConnector?.status === "connected" ? outlookConnector :
    smtpConnector?.status === "connected" ? smtpConnector :
    null;

  if (!activeConnector) {
    // Check if any are configured but not connected
    const configured =
      connector?.status === "configured" ? connector :
      outlookConnector?.status === "configured" ? outlookConnector :
      smtpConnector?.status === "configured" ? smtpConnector :
      null;

    if (configured) {
      // Tier 2: draft only
      return {
        success: true,
        tier: 2,
        draft: {
          subject: message.subject,
          body: message.html,
          to: message.to,
        },
      };
    }

    // Tier 3: can't do it
    return {
      success: false,
      tier: 3,
      connect_prompt: "Connect your Gmail or Outlook to send emails automatically. For now, you can copy this message and send it manually.",
      draft: {
        subject: message.subject,
        body: message.html,
        to: message.to,
      },
    };
  }

  // Tier 1: send via Resend (using existing API key)
  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const fromAddress = message.from_name
      ? `${message.from_name} <bookings@aireceptionist.com>`
      : `${(await getBusinessName(supabase, receptionistId))} <bookings@aireceptionist.com>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text || message.html.replace(/<[^>]+>/g, ""),
        reply_to: message.reply_to,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Email send failed");
    }

    return {
      success: true,
      tier: 1,
      message_id: data.id,
    };
  } catch (err: any) {
    return {
      success: false,
      tier: 1,
      error: err.message,
    };
  }
}

/**
 * Send a bulk email campaign.
 * Returns tier-aware results for each recipient.
 */
export async function sendBulkEmail(
  supabase: SupabaseClient,
  userId: string,
  receptionistId: string,
  recipients: Array<{ email: string; name?: string }>,
  subject: string,
  htmlBuilder: (name: string) => string,
): Promise<{
  tier: 1 | 2 | 3;
  sent: number;
  drafted: number;
  failed: number;
  drafts: Array<{ to: string; subject: string; body: string }>;
  errors: string[];
}> {
  // Check tier once
  const { data: connector } = await supabase
    .from("connectors")
    .select("status, current_tier")
    .eq("user_id", userId)
    .eq("connector_key", "gmail")
    .maybeSingle();

  const tier = connector?.status === "connected" ? 1 :
    connector?.status === "configured" ? 2 : 3;

  const results = {
    tier: tier as 1 | 2 | 3,
    sent: 0,
    drafted: 0,
    failed: 0,
    drafts: [] as Array<{ to: string; subject: string; body: string }>,
    errors: [] as string[],
  };

  for (const recipient of recipients) {
    const message: EmailMessage = {
      to: recipient.email,
      subject,
      html: htmlBuilder(recipient.name || "there"),
    };

    const result = await sendEmail(supabase, userId, receptionistId, message);

    if (result.success && result.tier === 1) {
      results.sent++;
    } else if (result.draft) {
      results.drafted++;
      results.drafts.push(result.draft);
    } else {
      results.failed++;
      if (result.error) results.errors.push(result.error);
    }
  }

  return results;
}

async function getBusinessName(
  supabase: SupabaseClient,
  receptionistId: string,
): Promise<string> {
  const { data } = await supabase
    .from("receptionists")
    .select("business_name")
    .eq("id", receptionistId)
    .maybeSingle();
  return data?.business_name || "Business";
}
