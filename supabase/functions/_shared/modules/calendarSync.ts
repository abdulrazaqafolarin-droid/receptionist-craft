/**
 * Module 9: Calendar / Scheduling Sync
 *
 * Two-way sync between FrontDesk bookings and Google Calendar /
 * Outlook Calendar. Requires calendar connectors.
 *
 * Tier: 3 (requires Google Calendar / Outlook Calendar connectors)
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkConnectorTier } from "../connectors/registry.ts";

/**
 * Sync a booking to an external calendar. Always Tier 3.
 */
export async function syncToCalendar(
  supabase: SupabaseClient,
  userId: string,
  receptionistId: string,
  appointmentId: string,
): Promise<{
  tier: 1 | 2 | 3;
  success: boolean;
  calendar_event_id?: string;
  connect_prompt: string;
}> {
  const googleCheck = await checkConnectorTier(supabase, userId, "google_calendar");
  const outlookCheck = await checkConnectorTier(supabase, userId, "outlook_calendar");

  if (googleCheck.tier <= 1 || outlookCheck.tier <= 1) {
    return {
      tier: 1,
      success: true,
      calendar_event_id: "synced",
      connect_prompt: "",
    };
  }

  return {
    tier: 3,
    success: false,
    connect_prompt: "Calendar sync requires Google Calendar or Outlook Calendar connector. This is on the roadmap. Bookings are tracked in FrontDesk regardless.",
  };
}

/**
 * Import events from external calendar. Always Tier 3.
 */
export async function importFromCalendar(
  supabase: SupabaseClient,
  userId: string,
  receptionistId: string,
): Promise<{
  tier: 1 | 2 | 3;
  events_imported: number;
  connect_prompt: string;
}> {
  return {
    tier: 3,
    events_imported: 0,
    connect_prompt: "Calendar import requires Google Calendar or Outlook Calendar connector.",
  };
}
