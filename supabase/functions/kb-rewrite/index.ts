import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};

/**
 * Protected Autonomous KB Rewrite Engine
 * 
 * SAFETY GUARANTEES:
 * 1. NEVER applies rewrites automatically
 * 2. NEVER modifies business-critical fields (services, prices, addresses, hours)
 * 3. ALWAYS logs suggestions to kb_rewrite_log with auto_suggest=true
 * 4. Requires explicit user approval to apply
 */

const PROTECTED_KEYS = [
  "services", "prices", "pricing", "address", "location",
  "phone", "hours", "hours_of_operation", "policies",
  "services_and_prices", "business_phone"
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { action, receptionistId, userId } = await req.json();

    if (action === "analyze") {
      // Analyze recent responses and suggest KB improvements
      console.log(`[KB] Analyzing receptionist ${receptionistId}...`);

      // Get receptionist current KB
      const { data: receptionist } = await supabase
        .from("receptionists")
        .select("knowledge_base, system_prompt, business_info")
        .eq("id", receptionistId)
        .single();

      if (!receptionist) {
        throw new Error("Receptionist not found");
      }

      // Get low-quality responses (last 7 days)
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: lowQualityResponses } = await supabase
        .from("ai_responses")
        .select("request_message, reply_text, quality_score, confidence")
        .eq("receptionist_id", receptionistId)
        .gte("created_at", weekAgo)
        .limit(50);

      if (!lowQualityResponses || lowQualityResponses.length === 0) {
        return new Response(JSON.stringify({ 
          suggestions: [],
          message: "No low-quality responses found - KB is performing well!" 
        }), {
          headers: { ...CORS, "Content-Type": "application/json" }
        });
      }

      // Filter for actually low quality (< 0.6)
      const poorResponses = lowQualityResponses.filter(r => {
        const qs = typeof r.quality_score === 'string' 
          ? JSON.parse(r.quality_score) 
          : r.quality_score;
        const score = qs?.overall || qs?.confidence || r.confidence || 0;
        return score < 0.6;
      });

      if (poorResponses.length === 0) {
        return new Response(JSON.stringify({ 
          suggestions: [],
          message: "Quality is good - no rewrites needed" 
        }), {
          headers: { ...CORS, "Content-Type": "application/json" }
        });
      }

      console.log(`[KB] Found ${poorResponses.length} low-quality responses`);

      // Use AI to analyze and suggest improvements
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        throw new Error("LOVABLE_API_KEY not configured");
      }

      const analysisPrompt = `You are a knowledge base optimization expert.

Current KB:
${receptionist.knowledge_base || "No KB yet"}

Recent questions with poor responses:
${poorResponses.slice(0, 10).map(r => `Q: ${r.request_message}\nA: ${r.reply_text}`).join("\n\n")}

Task: Suggest improvements to the knowledge base to better answer these questions.

CRITICAL RULES:
- Do NOT remove or modify: ${PROTECTED_KEYS.join(", ")}
- Only suggest ADDITIONS or CLARIFICATIONS
- Focus on missing information
- Keep suggestions concise
- Return JSON array of suggestions

Format:
{
  "suggestions": [
    {
      "type": "addition",
      "section": "section_name",
      "content": "what to add",
      "reason": "why this helps"
    }
  ]
}`;

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You are a KB optimization expert. Return valid JSON only." },
            { role: "user", content: analysisPrompt }
          ],
          temperature: 0.3,
        }),
      });

      if (!aiRes.ok) {
        throw new Error(`AI request failed: ${aiRes.status}`);
      }

      const aiData = await aiRes.json();
      const content = aiData.choices?.[0]?.message?.content || "{}";
      
      let suggestions;
      try {
        // Try to extract JSON from markdown code blocks if present
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```\n([\s\S]*?)\n```/);
        const jsonStr = jsonMatch ? jsonMatch[1] : content;
        suggestions = JSON.parse(jsonStr);
      } catch (e) {
        console.warn("[KB] Failed to parse AI response as JSON:", content);
        suggestions = { suggestions: [] };
      }

      // Store suggestions in kb_rewrite_log (auto_suggest=true, NOT applied)
      if (suggestions.suggestions && suggestions.suggestions.length > 0) {
        const original = {
          knowledge_base: receptionist.knowledge_base,
          system_prompt: receptionist.system_prompt
        };

        const { error: logError } = await supabase
          .from("kb_rewrite_log")
          .insert({
            receptionist_id: receptionistId,
            user_id: userId,
            original: original,
            rewritten: suggestions, // Store suggestions, not full rewrite
            changes: { suggested_additions: suggestions.suggestions.length },
            reason: `Analyzed ${poorResponses.length} low-quality responses`,
            auto_suggest: true
          });

        if (logError) {
          console.error("[KB] Failed to log suggestions:", logError);
        }
      }

      return new Response(JSON.stringify({ 
        success: true,
        analyzed: poorResponses.length,
        suggestions: suggestions.suggestions || []
      }), {
        headers: { ...CORS, "Content-Type": "application/json" }
      });

    } else if (action === "apply") {
      // Apply a KB rewrite (requires explicit approval)
      const { logId } = await req.json();
      
      if (!logId) {
        throw new Error("logId required for apply action");
      }

      console.log(`[KB] Applying KB rewrite ${logId}...`);

      // Get the rewrite log
      const { data: log } = await supabase
        .from("kb_rewrite_log")
        .select("*")
        .eq("id", logId)
        .single();

      if (!log) {
        throw new Error("Rewrite log not found");
      }

      // Verify ownership
      const { data: receptionist } = await supabase
        .from("receptionists")
        .select("user_id")
        .eq("id", log.receptionist_id)
        .single();

      if (receptionist?.user_id !== userId) {
        throw new Error("Unauthorized - you don't own this receptionist");
      }

      // Safety check: ensure rewritten data doesn't remove protected keys
      const rewritten = log.rewritten;
      for (const key of PROTECTED_KEYS) {
        if (log.original[key] && !rewritten[key]) {
          throw new Error(`Cannot remove protected field: ${key}`);
        }
      }

      // Apply the rewrite
      const { error: updateError } = await supabase
        .from("receptionists")
        .update({
          knowledge_base: rewritten.knowledge_base,
          system_prompt: rewritten.system_prompt
        })
        .eq("id", log.receptionist_id);

      if (updateError) {
        throw updateError;
      }

      // Update log to mark as applied
      await supabase
        .from("kb_rewrite_log")
        .update({ auto_suggest: false })
        .eq("id", logId);

      console.log(`[KB] Rewrite applied successfully`);

      return new Response(JSON.stringify({ 
        success: true,
        message: "KB rewrite applied successfully"
      }), {
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    throw new Error("Invalid action - must be 'analyze' or 'apply'");

  } catch (err) {
    console.error("[KB] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});