/**
 * Module 8: SMS / Text Campaign
 *
 * Sends appointment reminders, promotions, or re-engagement texts.
 * Uses the generic SMS sender which checks Twilio connector tier.
 *
 * Tier 1: Twilio connected — sends automatically
 * Tier 2: No connection — drafts for manual send
 * Tier 3: No SMS — drafts only
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendBulkSms } from "../channels/smsSender.ts";

export interface SmsCampaignRequest {
  name: string;
  body_template: string;       // Supports {{name}}, {{appointment_date}}, {{business_name}}
  target: "upcoming_appointments" | "no_show_followup" | "all_customers" | "no_visit_30d";
}

/**
 * Execute an SMS campaign.
 */
export async function executeSmsCampaign(
  supabase: SupabaseClient,
  userId: string,
  receptionistId: string,
  campaign: SmsCampaignRequest,
): Promise<{
  tier: 1 | 2 | 3;
  total_recipients: number;
  sent: number;
  drafted: number;
  failed: number;
}> {
  const { data: rec } = await supabase
    .from("receptionists")
    .select("business_name")
    .eq("id", receptionistId)
    .maybeSingle();

  const businessName = rec?.business_name || "the business";

  // Get target recipients
  const recipients = await getSmsRecipients(supabase, receptionistId, campaign.target);

  if (recipients.length === 0) {
    return { tier: 2, total_recipients: 0, sent: 0, drafted: 0, failed: 0 };
  }

  const result = await sendBulkSms(
    supabase,
    userId,
    receptionistId,
    recipients.map((r) => ({ phone: r.phone, name: r.name })),
    (name) => {
      let body = campaign.body_template;
      body = body.replace(/\{\{name\}\}/g, name);
      body = body.replace(/\{\{business_name\}\}/g, businessName);
      return body;
    },
  );

  // Track
  await supabase.from("conversion_events").insert({
    receptionist_id: receptionistId,
    session_id: "campaign",
    event_type: "sms_campaign_sent",
    revenue_value: 0,
    currency: "USD",
    metadata: {
      campaign_name: campaign.name,
      target: campaign.target,
      total: recipients.length,
      sent: result.sent,
      drafted: result.drafted,
    },
  });

  return {
    tier: result.tier,
    total_recipients: recipients.length,
    sent: result.sent,
    drafted: result.drafted,
    failed: result.failed,
  };
}

async function getSmsRecipients(
  supabase: SupabaseClient,
  receptionistId: string,
  target: string,
): Promise<Array<{ phone: string; name: string }>> {
  let query = supabase
    .from("customers")
    .select("phone, name")
    .eq("receptionist_id", receptionistId)
    .not("phone", "is", null);

  switch (target) {
    case "upcoming_appointments": {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: appts } = await supabase
        .from("appointments")
        .select("customer_phone, customer_name")
        .eq("receptionist_id", receptionistId)
        .eq("status", "confirmed")
        .gte("start_time", tomorrow)
        .lte("start_time", nextWeek);

      return (appts || [])
        .filter((a) => a.customer_phone)
        .map((a) => ({ phone: a.customer_phone!, name: a.customer_name || "there" }));
    }
    case "no_visit_30d": {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      query = query.lt("last_visit", cutoff);
      break;
    }
  }

  const { data } = await query;
  return (data || []).filter((c) => c.phone) as Array<{ phone: string; name: string }>;
}
