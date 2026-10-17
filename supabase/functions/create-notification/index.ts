import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { canCreateNotification } from "../_shared/notificationAuth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const jwt = auth.replace("Bearer ", "");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "")
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(jwt);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    const required = ["type", "title", "body"];
    for (const r of required) {
      if (typeof body[r] !== "string" || !body[r].trim()) {
        return new Response(
          JSON.stringify({ error: `Missing required field: ${r}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const requestedUserId = typeof body.user_id === "string" ? body.user_id : null;
    const receptionistId = typeof body.receptionist_id === "string" ? body.receptionist_id : null;
    if (body.receptionist_id != null && !receptionistId) {
      return new Response(JSON.stringify({ error: "Invalid receptionist_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let receptionistOwnerId: string | null = null;
    if (receptionistId) {
      const { data: receptionist, error: receptionistError } = await supabaseAdmin
        .from("receptionists")
        .select("user_id")
        .eq("id", receptionistId)
        .maybeSingle();
      if (receptionistError || !receptionist) {
        return new Response(JSON.stringify({ error: "Receptionist not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      receptionistOwnerId = typeof receptionist.user_id === "string" ? receptionist.user_id : null;
    }

    if (!canCreateNotification({
      callerUserId: user.id,
      requestedUserId,
      receptionistOwnerId,
      hasReceptionistTarget: !!receptionistId,
    })) {
      return new Response(JSON.stringify({ error: "Forbidden notification target" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: insertError } = await supabaseAdmin
      .from("notifications")
      .insert({
        type: body.type.slice(0, 80),
        title: body.title.slice(0, 200),
        message: body.body.slice(0, 2000),
        body: body.body.slice(0, 2000),
        user_id: user.id,
        receptionist_id: receptionistId,
        severity: body.severity ?? "info",
        priority: body.severity === "critical" ? "high" : "normal",
        metadata: body.meta ?? {},
        category: body.category ?? "general",
      });

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Server error:", err);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
