import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const url = new URL(req.url);
    
    // POST /ingest - persist analytics data
    if (req.method === "POST" && url.pathname.endsWith("/ingest")) {
      console.log("Analytics ingest request received");
      const body = await req.json();
      
      // expected body: { receptionist_id, user_id, request_message, reply_text, model, latency_ms, temperature, quality_score, channel }
      const payload = {
        receptionist_id: body.receptionist_id,
        user_id: body.user_id || null,
        request_message: body.request_message,
        reply_text: body.reply_text,
        model: body.model || null,
        latency_ms: body.latency_ms || null,
        temperature: body.temperature || null,
        quality_score: body.quality_score ? JSON.stringify(body.quality_score) : null,
        confidence: body.quality_score ? body.quality_score.confidence || body.quality_score.overall || null : null,
        channel: body.channel || "chat",
        flagged: false
      };
      
      console.log("Inserting analytics payload:", payload);
      const { error } = await supabase.from("ai_responses").insert([payload]);
      if (error) {
        console.error("Error inserting analytics:", error);
        throw error;
      }
      
      console.log("Analytics ingested successfully");
      return new Response(JSON.stringify({ ok: true }), { headers: CORS, status: 200 });
    }

    // GET /stats - retrieve aggregate statistics
    if (req.method === "GET" && url.pathname.endsWith("/stats")) {
      const receptionistId = url.searchParams.get("receptionistId");
      if (!receptionistId) {
        return new Response(
          JSON.stringify({ error: "receptionistId required" }), 
          { status: 400, headers: CORS }
        );
      }

      console.log("Fetching stats for receptionist:", receptionistId);

      // Basic aggregates
      const totalRes = await supabase
        .from("ai_responses")
        .select("id", { count: "exact", head: true })
        .eq("receptionist_id", receptionistId);

      // Fetch rows to compute averages
      const rows = await supabase
        .from("ai_responses")
        .select("quality_score")
        .eq("receptionist_id", receptionistId)
        .limit(1000);

      let avgOverall = null;
      if (rows?.data?.length) {
        const vals = rows.data
          .map(r => {
            try {
              const score = typeof r.quality_score === 'string' 
                ? JSON.parse(r.quality_score) 
                : r.quality_score;
              return score?.overall || null;
            } catch {
              return null;
            }
          })
          .filter(Boolean);
        if (vals.length) {
          avgOverall = vals.reduce((a, b) => a + b, 0) / vals.length;
        }
      }

      const flagged = await supabase
        .from("ai_responses")
        .select("id", { count: "exact", head: true })
        .eq("receptionist_id", receptionistId)
        .eq("flagged", true);

      const recent = await supabase
        .from("ai_responses")
        .select("id, request_message, reply_text, quality_score, created_at")
        .eq("receptionist_id", receptionistId)
        .order("created_at", { ascending: false })
        .limit(20);

      console.log("Stats computed successfully");
      return new Response(JSON.stringify({
        total: totalRes.count ?? 0,
        avgOverall,
        flaggedCount: flagged.count ?? 0,
        recent: recent.data ?? []
      }), { headers: CORS, status: 200 });
    }

    return new Response(
      JSON.stringify({ error: "unsupported endpoint" }), 
      { status: 400, headers: CORS }
    );
  } catch (err) {
    console.error("Analytics function error:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: errorMessage }), 
      { status: 500, headers: CORS }
    );
  }
});
