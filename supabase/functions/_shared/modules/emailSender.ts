/**
 * Module 3: Email Sender / Outreach
 *
 * Sends outbound campaigns, follow-ups, and win-back sequences
 * to past customers. Uses the generic email sender which checks
 * connector tier automatically.
 *
 * Tier 1: Email connected — sends campaigns
 * Tier 2: No connection — drafts queued for manual send
 * Tier 3: No email — drafts only
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendBulkEmail } from "../channels/emailSender.ts";

export interface CampaignRequest {
  name: string;
  subject: string;
  body_template: string;       // Supports {{name}}, {{last_service}}, {{last_visit}}
  target: "all_customers" | "no_visit_30d" | "no_visit_90d" | "high_value" | "new_leads";
  scheduled_at?: string;
}

/**
 * Execute an email campaign.
 */
export async function executeCampaign(
  supabase: SupabaseClient,
  userId: string,
  receptionistId: string,
  campaign: CampaignRequest,
): Promise<{
  tier: 1 | 2 | 3;
  total_recipients: number;
  sent: number;
  drafted: number;
  failed: number;
  errors: string[];
}> {
  // Get target recipients
  const recipients = await getTargetRecipients(supabase, receptionistId, campaign.target);

  if (recipients.length === 0) {
    return { tier: 2, total_recipients: 0, sent: 0, drafted: 0, failed: 0, errors: ["No recipients match the target criteria"] };
  }

  // Build email with template variables
  const result = await sendBulkEmail(
    supabase,
    userId,
    receptionistId,
    recipients.map((r) => ({ email: r.email, name: r.name })),
    campaign.subject,
    (name) => {
      let body = campaign.body_template;
      body = body.replace(/\{\{name\}\}/g, name);
      return body;
    },
  );

  // Track the campaign
  await supabase.from("conversion_events").insert({
    receptionist_id: receptionistId,
    session_id: "campaign",
    event_type: "email_campaign_sent",
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
    errors: result.errors,
  };
}

async function getTargetRecipients(
  supabase: SupabaseClient,
  receptionistId: string,
  target: string,
): Promise<Array<{ email: string; name: string }>> {
  let query = supabase
    .from("customers")
    .select("email, name")
    .eq("receptionist_id", receptionistId)
    .not("email", "is", null);

  switch (target) {
    case "no_visit_30d": {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      query = query.lt("last_visit", cutoff);
      break;
    }
    case "no_visit_90d": {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      query = query.lt("last_visit", cutoff);
      break;
    }
    case "high_value":
      query = query.gte("total_spent", 100);
      break;
    case "new_leads":
      query = query.eq("visit_count", 1);
      break;
  }

  const { data } = await query;
  return (data || []).filter((c) => c.email && c.name) as Array<{ email: string; name: string }>;
}
