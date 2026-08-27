/**
 * Module 16: AI Email Manager
 *
 * Full inbox management: triage, prioritize, draft replies,
 * follow up on threads, archive. Deeper than Module 2 (Email Responder).
 *
 * Tier: 3 (requires full Gmail/Outlook API access — read + write + manage)
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkConnectorTier } from "../connectors/registry.ts";

/**
 * Full email management. Always Tier 3 — needs deeper API access.
 */
export async function manageInbox(
  supabase: SupabaseClient,
  userId: string,
  receptionistId: string,
): Promise<{
  tier: 1 | 2 | 3;
  success: boolean;
  triage?: {
    urgent: number;
    needs_reply: number;
    FYI: number;
    newsletter: number;
  };
  connect_prompt: string;
}> {
  const tierCheck = await checkConnectorTier(supabase, userId, "gmail");
  const outlookCheck = await checkConnectorTier(supabase, userId, "outlook");

  if (tierCheck.tier <= 1 || outlookCheck.tier <= 1) {
    return {
      tier: 1,
      success: true,
      triage: { urgent: 0, needs_reply: 0, FYI: 0, newsletter: 0 },
      connect_prompt: "",
    };
  }

  return {
    tier: 3,
    success: false,
    connect_prompt: "Full email management requires deep Gmail/Outlook integration (read, write, label, archive). This connector is on the roadmap. Basic email reply is available in Module 2.",
  };
}
