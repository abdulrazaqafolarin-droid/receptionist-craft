/**
 * Test Conversation Mode
 *
 * Real operational capability: lets business owners test their operator
 * before going live. Runs the REAL widget-chat pipeline but marks
 * everything as test data so it doesn't pollute analytics.
 *
 * This is not a mock — it's the real AI, real config, real booking logic.
 * The only difference: test conversations are tagged and excluded from
 * production analytics.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface TestConversationResult {
  reply: string;
  intent: string;
  flow: string;
  ui_signal: Record<string, unknown> | null;
  booking_created: boolean;
  order_created: boolean;
  escalation_triggered: boolean;
  test_session_id: string;
}

/**
 * Run a test message through the real widget-chat pipeline.
 * Returns the AI's response plus metadata about what happened.
 */
export async function runTestMessage(
  supabase: SupabaseClient,
  receptionistId: string,
  message: string,
  testSessionId: string,
): Promise<TestConversationResult> {
  // Call the real widget-chat function with test_mode flag
  const { data, error } = await supabase.functions.invoke("widget-chat", {
    body: {
      receptionist_id: receptionistId,
      message,
      session_id: testSessionId,
      test_mode: true, // Tells widget-chat this is a test
    },
  });

  if (error) {
    console.error("[TestMode] Widget-chat error:", error);
    return {
      reply: `Error: ${error.message}`,
      intent: "error",
      flow: "error",
      ui_signal: null,
      booking_created: false,
      order_created: false,
      escalation_triggered: false,
      test_session_id: testSessionId,
    };
  }

  return {
    reply: data.reply || data.message || "No response",
    intent: data.intent || "unknown",
    flow: data.flow || "unknown",
    ui_signal: data.ui_signal || null,
    booking_created: data.booking_created || false,
    order_created: data.order_created || false,
    escalation_triggered: data.escalation_triggered || false,
    test_session_id: testSessionId,
  };
}

/**
 * Clean up test data: delete test conversations, bookings, orders.
 * Called when the owner is done testing and wants to clear test artifacts.
 */
export async function cleanupTestData(
  supabase: SupabaseClient,
  receptionistId: string,
): Promise<{ deleted: number }> {
  let totalDeleted = 0;

  // Delete test chat messages
  const { count: msgCount } = await supabase
    .from("chat_messages")
    .delete({ count: "exact" })
    .eq("receptionist_id", receptionistId)
    .like("session_id", "test_%");

  totalDeleted += msgCount || 0;

  // Delete test appointments
  const { count: apptCount } = await supabase
    .from("appointments")
    .delete({ count: "exact" })
    .eq("receptionist_id", receptionistId)
    .like("metadata->>test_mode", "true");

  totalDeleted += apptCount || 0;

  // Delete test orders
  const { count: orderCount } = await supabase
    .from("orders")
    .delete({ count: "exact" })
    .eq("receptionist_id", receptionistId)
    .like("metadata->>test_mode", "true");

  totalDeleted += orderCount || 0;

  // Delete test conversation states
  const { count: stateCount } = await supabase
    .from("conversation_state")
    .delete({ count: "exact" })
    .eq("receptionist_id", receptionistId)
    .like("session_id", "test_%");

  totalDeleted += stateCount || 0;

  console.log(`[TestMode] Cleaned up ${totalDeleted} test artifacts`);
  return { deleted: totalDeleted };
}

/**
 * Get test conversation history for a receptionist.
 */
export async function getTestHistory(
  supabase: SupabaseClient,
  receptionistId: string,
): Promise<Array<{
  session_id: string;
  sender: string;
  message: string;
  created_at: string;
}>> {
  const { data } = await supabase
    .from("chat_messages")
    .select("session_id, sender, message, created_at")
    .eq("receptionist_id", receptionistId)
    .like("session_id", "test_%")
    .order("created_at", { ascending: true });

  return data || [];
}
