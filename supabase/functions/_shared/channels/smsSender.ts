/**
 * Generic SMS Sender
 *
 * Sends SMS via Twilio API. Used by all modules that need
 * to deliver content via text (reminders, campaigns, follow-ups, etc.).
 *
 * Tier: 1 when Twilio SMS connected, Tier 2 (drafts), Tier 3 (not connected)
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface SmsMessage {
  to: string;
  body: string;
}

export interface SmsSendResult {
  success: boolean;
  tier: 1 | 2 | 3;
  message_sid?: string;
  error?: string;
  draft?: { to: string; body: string };
  connect_prompt?: string;
}

/**
 * Send an SMS via the configured Twilio connector.
 */
export async function sendSms(
  supabase: SupabaseClient,
  userId: string,
  receptionistId: string,
  message: SmsMessage,
): Promise<SmsSendResult> {
  // Check connector tier
  const { data: connector } = await supabase
    .from("connectors")
    .select("status, current_tier, config_json")
    .eq("user_id", userId)
    .eq("connector_key", "twilio_sms")
    .maybeSingle();

  if (!connector || connector.status === "not_configured") {
    // Check if configured but not connected
    if (connector?.status === "configured") {
      return {
        success: true,
        tier: 2,
        draft: { to: message.to, body: message.body },
      };
    }

    return {
      success: false,
      tier: 3,
      connect_prompt: "Connect Twilio to send text messages automatically. For now, you can copy this message and send it yourself.",
      draft: { to: message.to, body: message.body },
    };
  }

  if (connector.status !== "connected") {
    return {
      success: false,
      tier: 2,
      draft: { to: message.to, body: message.body },
      error: `Connector status: ${connector.status}`,
    };
  }

  // Tier 1: send via Twilio
  try {
    const config = connector.config_json as Record<string, string>;
    const accountSid = config.account_sid;
    const authToken = config.auth_token;
    const fromNumber = config.phone_number;

    if (!accountSid || !authToken || !fromNumber) {
      throw new Error("Twilio credentials incomplete");
    }

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: message.to,
          From: fromNumber,
          Body: message.body,
        }),
      },
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "SMS send failed");
    }

    return {
      success: true,
      tier: 1,
      message_sid: data.sid,
    };
  } catch (err) {
    const errText = err instanceof Error ? err.message : "SMS send failed";
    return {
      success: false,
      tier: 1,
      error: errText,
      draft: { to: message.to, body: message.body },
    };
  }
}

/**
 * Send bulk SMS campaign.
 */
export async function sendBulkSms(
  supabase: SupabaseClient,
  userId: string,
  receptionistId: string,
  recipients: Array<{ phone: string; name?: string }>,
  bodyBuilder: (name: string) => string,
): Promise<{
  tier: 1 | 2 | 3;
  sent: number;
  drafted: number;
  failed: number;
  drafts: Array<{ to: string; body: string }>;
  errors: string[];
}> {
  const { data: connector } = await supabase
    .from("connectors")
    .select("status")
    .eq("user_id", userId)
    .eq("connector_key", "twilio_sms")
    .maybeSingle();

  const tier = connector?.status === "connected" ? 1 :
    connector?.status === "configured" ? 2 : 3;

  const results = {
    tier: tier as 1 | 2 | 3,
    sent: 0,
    drafted: 0,
    failed: 0,
    drafts: [] as Array<{ to: string; body: string }>,
    errors: [] as string[],
  };

  for (const recipient of recipients) {
    const result = await sendSms(supabase, userId, receptionistId, {
      to: recipient.phone,
      body: bodyBuilder(recipient.name || "there"),
    });

    if (result.success && result.tier === 1) results.sent++;
    else if (result.draft) { results.drafted++; results.drafts.push(result.draft); }
    else { results.failed++; if (result.error) results.errors.push(result.error); }
  }

  return results;
}
