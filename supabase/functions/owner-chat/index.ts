// ═══════════════════════════════════════════════════════════════════════════
// OWNER CHAT EDGE FUNCTION
// ═══════════════════════════════════════════════════════════════════════════
// Owner's conversational management interface endpoint.
// Routes through the SAME Configurator identity as onboarding.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import { processOwnerMessage, applyProposal } from "../_shared/ownerAgent/conversationalCRUD.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || "";

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action, sessionId, message, pendingClarifications, clarificationResponses, proposalId } = body;

    // Find receptionist for this user
    const { data: receptionist } = await supabase
      .from("receptionists")
      .select("id, user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!receptionist) {
      return new Response(
        JSON.stringify({ error: "No receptionist found for this user" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const receptionistId = receptionist.id;
    const session_id = sessionId || `owner_${user.id}_${Date.now()}`;

    let result;

    switch (action) {
      case "apply_proposal": {
        if (!proposalId) {
          return new Response(
            JSON.stringify({ error: "proposalId required for apply_proposal" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        result = await applyProposal(
          { supabase, receptionistId, userId: user.id, sessionId: session_id },
          proposalId
        );
        break;
      }

      case "get_proposals": {
        const { data: proposals } = await supabase
          .from("owner_proposals")
          .select("*")
          .eq("receptionist_id", receptionistId)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(10);
        return new Response(
          JSON.stringify({ proposals: proposals || [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get_history": {
        const { data: history } = await supabase
          .from("owner_proposals")
          .select("*")
          .eq("receptionist_id", receptionistId)
          .order("created_at", { ascending: false })
          .limit(20);
        return new Response(
          JSON.stringify({ history: history || [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "send_message":
      default: {
        if (!message) {
          return new Response(
            JSON.stringify({ error: "message required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Store owner message
        await supabase.from("owner_chat_messages").insert({
          session_id,
          receptionist_id: receptionistId,
          user_id: user.id,
          role: "owner",
          content: message,
          message_type: "text",
          created_at: new Date().toISOString(),
        });

        // Process through conversational CRUD
        const processed = await processOwnerMessage(
          { supabase, receptionistId, userId: user.id, sessionId: session_id },
          message,
          body.pendingClarifications,
          body.clarificationResponses
        );

        // Store agent responses
        for (const msg of processed.messages) {
          await supabase.from("owner_chat_messages").insert({
            session_id,
            receptionist_id: receptionistId,
            user_id: user.id,
            role: msg.role,
            content: msg.content,
            message_type: msg.message_type,
            proposal_id: msg.proposal?.id,
            metadata: {
              proposal: msg.proposal,
              diffs: msg.diffs,
              clarifications: msg.clarifications,
              clarification_responses: msg.clarification_responses,
            },
            created_at: msg.created_at,
          });
        }

        return new Response(
          JSON.stringify({
            messages: processed.messages,
            pending_proposal: processed.pending_proposal,
            needs_clarification: processed.needs_clarification,
            sessionId: session_id,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[Owner Chat] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});