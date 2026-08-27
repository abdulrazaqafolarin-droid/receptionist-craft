/**
 * Module 6: Social Media Comment / DM Responder
 *
 * Responds to comments and DMs on social media posts using the
 * business's knowledge base. Requires social connectors.
 *
 * Tier: 3 (requires social media connectors)
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkConnectorTier } from "../connectors/registry.ts";

export interface SocialMessage {
  platform: "instagram" | "facebook" | "tiktok" | "linkedin" | "x";
  message_id: string;
  sender: string;
  text: string;
  is_dm: boolean;
}

/**
 * Handle an inbound social message. Always Tier 3.
 */
export async function handleSocialMessage(
  supabase: SupabaseClient,
  userId: string,
  receptionistId: string,
  message: SocialMessage,
): Promise<{
  tier: 1 | 2 | 3;
  success: boolean;
  reply?: string;
  draft?: string;
  connect_prompt: string;
}> {
  const connectorKey = message.platform === "x" ? "x" :
    message.platform === "linkedin" ? "linkedin" :
    message.platform === "tiktok" ? "tiktok" :
    message.platform === "instagram" ? "instagram" : "facebook";

  const tierCheck = await checkConnectorTier(supabase, userId, connectorKey);

  if (tierCheck.tier >= 2) {
    return {
      tier: 2,
      success: true,
      draft: `[AI would reply to ${message.sender} on ${message.platform}]`,
      connect_prompt: `Connect ${message.platform} to auto-respond to messages.`,
    };
  }

  return {
    tier: 3,
    success: false,
    connect_prompt: `Social media auto-response for ${message.platform} is on the roadmap. You'll need to respond manually for now.`,
  };
}
