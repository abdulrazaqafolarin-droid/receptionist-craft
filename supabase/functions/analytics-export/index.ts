import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    (Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "")
  );

  try {
    const body = await req.json();
    const { receptionistId, format = "json", startDate, endDate } = body;

    if (!receptionistId) {
      return new Response(
        JSON.stringify({ error: "receptionistId required" }),
        { status: 400, headers: CORS }
      );
    }

    console.log("Export request:", { receptionistId, format, startDate, endDate });

    // Build query with date filters
    let query = supabase
      .from("ai_responses")
      .select("created_at, request_message, reply_text, quality_score, latency_ms, model, temperature, receptionist_id, user_id")
      .eq("receptionist_id", receptionistId)
      .order("created_at", { ascending: false });

    if (startDate) {
      query = query.gte("created_at", startDate);
    }
    if (endDate) {
      query = query.lte("created_at", endDate);
    }

    const { data, error } = await query.limit(10000);

    if (error) throw error;

    if (!data || data.length === 0) {
      return new Response(
        JSON.stringify({ error: "No data found for export" }),
        { status: 404, headers: CORS }
      );
    }

    // Transform data for export
    const exportData = data.map((row) => {
      let qualityScore: Record<string, unknown> = {};
      try {
        qualityScore = typeof row.quality_score === "string"
          ? JSON.parse(row.quality_score)
          : row.quality_score || {};
      } catch {
        qualityScore = {};
      }

      return {
        timestamp: row.created_at,
        user_message: row.request_message || "",
        bot_reply: row.reply_text || "",
        quality_clarity: qualityScore.clarity || 0,
        quality_accuracy: qualityScore.accuracy || 0,
        quality_confidence: qualityScore.confidence || qualityScore.overall || 0,
        quality_overall: qualityScore.overall || qualityScore.confidence || 0,
        match_type: qualityScore.faqMatch ? "exact" : qualityScore.semanticMatch ? "semantic" : "none",
        model: row.model || "unknown",
        temperature: row.temperature || 0,
        latency_ms: row.latency_ms || 0,
        receptionist_id: row.receptionist_id,
        user_id: row.user_id || "",
      };
    });

    if (format === "csv") {
      // Generate CSV
      const headers = [
        "timestamp",
        "user_message",
        "bot_reply",
        "quality_clarity",
        "quality_accuracy",
        "quality_confidence",
        "quality_overall",
        "match_type",
        "model",
        "temperature",
        "latency_ms",
        "receptionist_id",
        "user_id",
      ];

      const csvRows = [headers.join(",")];
      
      for (const row of exportData) {
        const values = headers.map((header) => {
          const value = row[header as keyof typeof row];
          const escaped = String(value).replace(/"/g, '""');
          return `"${escaped}"`;
        });
        csvRows.push(values.join(","));
      }

      const csv = csvRows.join("\n");

      return new Response(csv, {
        headers: {
          ...CORS,
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="analytics-export-${Date.now()}.csv"`,
        },
      });
    } else {
      // JSON format
      return new Response(JSON.stringify(exportData, null, 2), {
        headers: {
          ...CORS,
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="analytics-export-${Date.now()}.json"`,
        },
      });
    }
  } catch (err) {
    console.error("Export error:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: CORS }
    );
  }
});
