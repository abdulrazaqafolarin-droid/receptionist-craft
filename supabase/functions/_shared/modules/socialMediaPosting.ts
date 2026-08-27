/**
 * Module 5: Social Media Posting
 *
 * Posts content to social media accounts on behalf of the business.
 * Requires Instagram/Facebook/TikTok/LinkedIn connectors.
 *
 * Tier: 3 (requires social media connectors)
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkConnectorTier } from "../connectors/registry.ts";
import { generateContent, type ContentRequest } from "./contentGeneration.ts";

export interface SocialPost {
  platform: "instagram" | "facebook" | "tiktok" | "linkedin" | "x";
  content: string;
  hashtags?: string[];
  image_url?: string;
  scheduled_at?: string;
}

/**
 * Post to social media. Always returns Tier 3 until social connectors are built.
 */
export async function postToSocial(
  supabase: SupabaseClient,
  userId: string,
  receptionistId: string,
  post: SocialPost,
): Promise<{
  tier: 1 | 2 | 3;
  success: boolean;
  post_id?: string;
  draft?: string;
  connect_prompt: string;
}> {
  const connectorKey = post.platform === "x" ? "x" :
    post.platform === "linkedin" ? "linkedin" :
    post.platform === "tiktok" ? "tiktok" :
    post.platform === "instagram" ? "instagram" : "facebook";

  const tierCheck = await checkConnectorTier(supabase, userId, connectorKey);

  if (tierCheck.tier >= 2) {
    // We can generate the content but not post it
    const content = await generateContent(supabase, receptionistId, {
      type: "social_caption",
      topic: post.content,
      platform: post.platform,
    });

    return {
      tier: 2,
      success: true,
      draft: content.body,
      connect_prompt: `Connect your ${post.platform} account to post automatically. For now, here's the content to copy and post manually.`,
    };
  }

  return {
    tier: 3,
    success: false,
    connect_prompt: `Social media posting for ${post.platform} is not yet available. This connector is on the roadmap. The AI can draft content for you to post manually.`,
    draft: post.content,
  };
}
