/**
 * Test Mode Edge Function
 *
 * Handles test conversation cleanup: deletes test artifacts
 * (chat messages, bookings, orders) tagged with test_mode.
 *
 * POST /functions/v1/test-mode
 * Body: { action: "cleanup", receptionist_id: "..." }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = (Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, receptionist_id } = await req.json();

    if (action !== "cleanup" || !receptionist_id) {
      return new Response(
        JSON.stringify({ error: "Invalid request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let totalDeleted = 0;

    // Delete test chat messages (session_id starts with "test_")
    const { count: msgCount } = await supabase
      .from("chat_messages")
      .delete({ count: "exact" })
      .eq("receptionist_id", receptionist_id)
      .like("session_id", "test_%");

    totalDeleted += msgCount || 0;

    // Delete test conversation states
    const { count: stateCount } = await supabase
      .from("conversation_state")
      .delete({ count: "exact" })
      .eq("receptionist_id", receptionist_id)
      .like("session_id", "test_%");

    totalDeleted += stateCount || 0;

    // Delete test conversation summaries
    const { count: summaryCount } = await supabase
      .from("conversation_summaries")
      .delete({ count: "exact" })
      .eq("receptionist_id", receptionist_id)
      .like("session_id", "test_%");

    totalDeleted += summaryCount || 0;

    // Delete test conversion events
    const { count: eventCount } = await supabase
      .from("conversion_events")
      .delete({ count: "exact" })
      .eq("receptionist_id", receptionist_id)
      .like("session_id", "test_%");

    totalDeleted += eventCount || 0;

    return new Response(
      JSON.stringify({ ok: true, deleted: totalDeleted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[test-mode] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
