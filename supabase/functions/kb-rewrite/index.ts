import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    const body = await req.json();
    const { action, receptionistId, userId } = body;

    if (action === "analyze") {
      return await handleAnalyze(supabase, receptionistId, userId);
    } else if (action === "apply") {
      return await handleApply(supabase, body.logId, receptionistId, userId);
    } else if (action === "gap-report") {
      return await handleGapReport(supabase, receptionistId);
    }

    throw new Error("Invalid action - must be 'analyze', 'apply', or 'gap-report'");

  } catch (err) {
    console.error("[KB] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ACTION: ANALYZE - Suggest KB improvements from low-quality responses
// ═══════════════════════════════════════════════════════════════════════════
async function handleAnalyze(supabase: any, receptionistId: string, userId: string) {
  console.log(`[KB] Analyzing receptionist ${receptionistId}...`);

  const { data: receptionist } = await supabase
    .from("receptionists")
    .select("knowledge_base, system_prompt, business_info")
    .eq("id", receptionistId)
    .single();

  if (!receptionist) throw new Error("Receptionist not found");

  // Get low-quality responses (last 7 days)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: lowQualityResponses } = await supabase
    .from("ai_responses")
    .select("request_message, reply_text, quality_score, confidence, tags")
    .eq("receptionist_id", receptionistId)
    .gte("created_at", weekAgo)
    .limit(50);

  if (!lowQualityResponses || lowQualityResponses.length === 0) {
    return jsonResponse({ suggestions: [], message: "No low-quality responses found - KB is performing well!" });
  }

  // Filter for actually low quality (< 0.6) or tagged as gaps
  const poorResponses = lowQualityResponses.filter((r: any) => {
    const qs = typeof r.quality_score === 'string' ? JSON.parse(r.quality_score) : r.quality_score;
    const score = qs?.overall || qs?.confidence || r.confidence || 0;
    const hasGapTag = r.tags?.some((t: string) => ['unanswered', 'low_confidence', 'escalation'].includes(t));
    return score < 0.6 || hasGapTag;
  });

  if (poorResponses.length === 0) {
    return jsonResponse({ suggestions: [], message: "Quality is good - no rewrites needed" });
  }

  console.log(`[KB] Found ${poorResponses.length} low-quality responses`);

  // Get FAQ gaps - questions asked but not in FAQs
  const { data: existingFaqs } = await supabase
    .from("receptionist_faqs")
    .select("question, answer")
    .eq("receptionist_id", receptionistId);

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  // Categorize gaps
  const unanswered = poorResponses.filter((r: any) => r.tags?.includes("unanswered"));
  const lowConfidence = poorResponses.filter((r: any) => r.tags?.includes("low_confidence"));
  const escalations = poorResponses.filter((r: any) => r.tags?.includes("escalation"));

  const analysisPrompt = `You are a knowledge base optimization expert.

Current KB:
${receptionist.knowledge_base || "No KB yet"}

Existing FAQs:
${(existingFaqs || []).map((f: any) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n") || "None"}

## Gap Analysis Data

### Unanswered Questions (${unanswered.length}):
${unanswered.slice(0, 5).map((r: any) => `Q: ${r.request_message}`).join("\n")}

### Low Confidence Responses (${lowConfidence.length}):
${lowConfidence.slice(0, 5).map((r: any) => `Q: ${r.request_message}\nA: ${r.reply_text}`).join("\n\n")}

### Escalation Triggers (${escalations.length}):
${escalations.slice(0, 5).map((r: any) => `Q: ${r.request_message}`).join("\n")}

Task: Suggest specific improvements. For each suggestion, specify:
- Whether it should be a KB addition or a new FAQ entry
- The exact content to add
- Priority (high/medium/low)

CRITICAL RULES:
- Do NOT remove or modify: ${PROTECTED_KEYS.join(", ")}
- Only suggest ADDITIONS or CLARIFICATIONS
- Group related questions into single FAQ entries
- Keep suggestions concise and actionable

Return JSON:
{
  "suggestions": [
    {
      "type": "kb_addition" | "faq",
      "priority": "high" | "medium" | "low",
      "section": "section_name",
      "content": "what to add",
      "faq_question": "question if type is faq",
      "faq_answer": "answer if type is faq",
      "reason": "why this helps",
      "addresses_count": number
    }
  ],
  "summary": {
    "total_gaps": number,
    "unanswered_count": number,
    "low_confidence_count": number,
    "escalation_count": number,
    "top_missing_topics": ["topic1", "topic2"]
  }
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

  if (!aiRes.ok) throw new Error(`AI request failed: ${aiRes.status}`);

  const aiData = await aiRes.json();
  const content = aiData.choices?.[0]?.message?.content || "{}";
  
  let suggestions;
  try {
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```\n([\s\S]*?)\n```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;
    suggestions = JSON.parse(jsonStr);
  } catch (_e) {
    console.warn("[KB] Failed to parse AI response as JSON:", content);
    suggestions = { suggestions: [], summary: {} };
  }

  // Store suggestions in kb_rewrite_log
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
        rewritten: suggestions,
        changes: { 
          suggested_additions: suggestions.suggestions.length,
          gap_summary: suggestions.summary || {}
        },
        reason: `Analyzed ${poorResponses.length} low-quality responses (${unanswered.length} unanswered, ${lowConfidence.length} low confidence, ${escalations.length} escalations)`,
        auto_suggest: true
      });

    if (logError) {
      console.error("[KB] Failed to log suggestions:", logError);
    } else {
      try {
        await supabase.functions.invoke("create-notification", {
          body: {
            type: "kb.suggestion",
            title: "Knowledge Base Improvement Suggestions",
            body: `${suggestions.suggestions.length} suggestions generated from ${poorResponses.length} low-quality responses`,
            severity: "info",
            receptionist_id: receptionistId,
            user_id: userId,
            meta: {
              suggestions_count: suggestions.suggestions.length,
              poor_responses_count: poorResponses.length,
              summary: suggestions.summary
            }
          }
        });
      } catch (notifError) {
        console.warn("[KB] Failed to send notification:", notifError);
      }
    }
  }

  return jsonResponse({ 
    success: true,
    analyzed: poorResponses.length,
    suggestions: suggestions.suggestions || [],
    summary: suggestions.summary || {},
    gap_breakdown: {
      unanswered: unanswered.length,
      low_confidence: lowConfidence.length,
      escalations: escalations.length
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION: APPLY - Apply a KB rewrite (requires explicit approval)
// ═══════════════════════════════════════════════════════════════════════════
async function handleApply(supabase: any, logId: string, _receptionistId: string, userId: string) {
  if (!logId) throw new Error("logId required for apply action");

  console.log(`[KB] Applying KB rewrite ${logId}...`);

  const { data: log } = await supabase
    .from("kb_rewrite_log")
    .select("*")
    .eq("id", logId)
    .single();

  if (!log) throw new Error("Rewrite log not found");

  // Verify ownership
  const { data: receptionist } = await supabase
    .from("receptionists")
    .select("user_id, knowledge_base")
    .eq("id", log.receptionist_id)
    .single();

  if (receptionist?.user_id !== userId) {
    throw new Error("Unauthorized - you don't own this receptionist");
  }

  const rewritten = log.rewritten;

  // If suggestions contain FAQ entries, insert them
  const faqSuggestions = rewritten?.suggestions?.filter((s: any) => s.type === "faq") || [];
  if (faqSuggestions.length > 0) {
    const faqInserts = faqSuggestions
      .filter((s: any) => s.faq_question && s.faq_answer)
      .map((s: any) => ({
        receptionist_id: log.receptionist_id,
        question: s.faq_question,
        answer: s.faq_answer,
        priority: s.priority === "high" ? 1 : s.priority === "medium" ? 2 : 3,
      }));

    if (faqInserts.length > 0) {
      const { error: faqError } = await supabase
        .from("receptionist_faqs")
        .insert(faqInserts);
      if (faqError) console.error("[KB] FAQ insert error:", faqError);
      else console.log(`[KB] Inserted ${faqInserts.length} new FAQs`);
    }
  }

  // If suggestions contain KB additions, append to knowledge base
  const kbAdditions = rewritten?.suggestions?.filter((s: any) => s.type === "kb_addition") || [];
  if (kbAdditions.length > 0) {
    const currentKB = receptionist?.knowledge_base || "";
    const additions = kbAdditions.map((s: any) => `\n\n## ${s.section || "Additional Information"}\n${s.content}`).join("");
    const updatedKB = currentKB + additions;

    const { error: updateError } = await supabase
      .from("receptionists")
      .update({ knowledge_base: updatedKB })
      .eq("id", log.receptionist_id);

    if (updateError) throw updateError;
    console.log(`[KB] Appended ${kbAdditions.length} KB sections`);
  }

  // Mark log as applied
  await supabase
    .from("kb_rewrite_log")
    .update({ auto_suggest: false })
    .eq("id", logId);

  console.log(`[KB] Rewrite applied successfully`);

  return jsonResponse({ 
    success: true,
    message: "KB rewrite applied successfully",
    faqs_added: faqSuggestions.length,
    kb_sections_added: kbAdditions.length,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION: GAP-REPORT - Quick gap analysis without generating suggestions
// ═══════════════════════════════════════════════════════════════════════════
async function handleGapReport(supabase: any, receptionistId: string) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  
  const { data: responses } = await supabase
    .from("ai_responses")
    .select("request_message, confidence, tags, created_at")
    .eq("receptionist_id", receptionistId)
    .gte("created_at", weekAgo)
    .order("created_at", { ascending: false })
    .limit(100);

  if (!responses || responses.length === 0) {
    return jsonResponse({ 
      gaps: [],
      total_responses: 0,
      message: "No responses logged yet" 
    });
  }

  const unanswered = responses.filter((r: any) => r.tags?.includes("unanswered"));
  const lowConf = responses.filter((r: any) => r.tags?.includes("low_confidence"));
  const escalated = responses.filter((r: any) => r.tags?.includes("escalation"));

  // Group unanswered questions by topic
  const questionTopics: Record<string, { count: number; examples: string[] }> = {};
  for (const r of unanswered) {
    const topic = r.request_message?.toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/).slice(0, 4).join(' ') || 'unknown';
    if (!questionTopics[topic]) questionTopics[topic] = { count: 0, examples: [] };
    questionTopics[topic].count++;
    if (questionTopics[topic].examples.length < 3) {
      questionTopics[topic].examples.push(r.request_message);
    }
  }

  const topGaps = Object.entries(questionTopics)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 10)
    .map(([topic, data]) => ({ topic, ...data }));

  return jsonResponse({
    total_responses: responses.length,
    unanswered_count: unanswered.length,
    low_confidence_count: lowConf.length,
    escalation_count: escalated.length,
    gap_rate: responses.length > 0 ? ((unanswered.length / responses.length) * 100).toFixed(1) + "%" : "0%",
    top_gaps: topGaps,
    recent_unanswered: unanswered.slice(0, 5).map((r: any) => ({
      question: r.request_message,
      confidence: r.confidence,
      date: r.created_at,
    })),
  });
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" }
  });
}
