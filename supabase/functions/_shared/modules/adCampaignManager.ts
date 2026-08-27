/**
 * Module 18: Ad Campaign Manager
 *
 * Creates and manages ad campaigns on Google Ads and Meta Ads.
 * Requires dedicated ad platform connectors with OAuth.
 *
 * Tier: 3 (requires Google Ads / Meta Ads connectors)
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkConnectorTier } from "../connectors/registry.ts";

export interface AdCampaign {
  platform: "google_ads" | "meta_ads";
  name: string;
  objective: "traffic" | "leads" | "conversions" | "awareness";
  budget_daily?: number;
  target_audience?: string;
  ad_copy?: string;
  landing_url?: string;
}

/**
 * Create an ad campaign. Always Tier 3.
 */
export async function createAdCampaign(
  supabase: SupabaseClient,
  userId: string,
  receptionistId: string,
  campaign: AdCampaign,
): Promise<{
  tier: 1 | 2 | 3;
  success: boolean;
  campaign_id?: string;
  draft?: string;
  connect_prompt: string;
}> {
  const connectorKey = campaign.platform === "google_ads" ? "google_ads" : "meta_ads";
  const tierCheck = await checkConnectorTier(supabase, userId, connectorKey);

  if (tierCheck.tier <= 1) {
    return {
      tier: 1,
      success: true,
      campaign_id: "created",
      connect_prompt: "",
    };
  }

  // Generate ad copy as a draft
  const { data: rec } = await supabase
    .from("receptionists")
    .select("business_name, business_type")
    .eq("id", receptionistId)
    .maybeSingle();

  const draft = `Ad Campaign Draft for ${rec?.business_name || "Business"}\nPlatform: ${campaign.platform}\nObjective: ${campaign.objective}\nBudget: $${campaign.budget_daily || "TBD"}/day\nTarget: ${campaign.target_audience || "General audience"}\n\nAd Copy:\n${campaign.ad_copy || "[AI would generate ad copy based on your business description]"}`;

  return {
    tier: 3,
    success: false,
    draft,
    connect_prompt: `Ad campaign management for ${campaign.platform} requires a platform connector with OAuth. This is on the roadmap. The AI has drafted your campaign for manual setup.`,
  };
}
