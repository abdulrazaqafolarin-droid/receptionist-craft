import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { messages, receptionistId, userId } = await req.json();

    // Input validation
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new Error("Messages array is required and cannot be empty");
    }
    if (!receptionistId) {
      throw new Error("Receptionist ID is required");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY missing");
    }

    console.log(`[Chat] Processing message for receptionist ${receptionistId}, user ${userId}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch receptionist
    const { data: r, error: rErr } = await supabase
      .from("receptionists")
      .select(
        "name, business_name, business_type, knowledge_base, business_info, tone, greeting_message, default_response, goal, system_prompt, language, temperature"
      )
      .eq("id", receptionistId)
      .maybeSingle();

    if (rErr || !r) throw new Error("Failed to load receptionist");

    // Fetch FAQs
    const { data: faqs } = await supabase
      .from("receptionist_faqs")
      .select("question, answer")
      .eq("receptionist_id", receptionistId)
      .order("priority", { ascending: false });

    console.log(`[Chat] Loaded ${faqs?.length || 0} FAQs`);

    // Fetch last 20 messages only for THIS receptionist (if userId provided)
    let history: Array<{ sender: string; message: string }> = [];
    if (userId) {
      const { data: historyData } = await supabase
        .from("chat_messages")
        .select("sender, message")
        .eq("receptionist_id", receptionistId)
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(20);
      history = historyData || [];
      console.log(`[Chat] Loaded ${history.length} history messages`);
    }

    // Convert DB memory → chat format
    const memoryMessages = history.map((h) => ({
      role: h.sender === "bot" ? "assistant" : "user",
      content: h.message,
    }));

    // Check if user message matches FAQ exactly (pre-filter)
    const userMessage = messages[messages.length - 1]?.content?.toLowerCase().trim() || "";
    let faqMatch = null;
    if (faqs && faqs.length > 0) {
      for (const faq of faqs) {
        const questionLower = faq.question.toLowerCase().trim();
        if (userMessage === questionLower || userMessage.includes(questionLower)) {
          faqMatch = faq;
          console.log(`[Chat] FAQ match found: "${faq.question}"`);
          break;
        }
      }
    }

    // FAQ text for system prompt
    const faqText =
      faqs && faqs.length > 0
        ? faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n")
        : "No FAQs provided.";

    // Business memory text
    const memoryText =
      r.knowledge_base ||
      (typeof r.business_info === "string"
        ? r.business_info
        : JSON.stringify(r.business_info || {}, null, 2));

    // Elite System Prompt — Very Strong Structure
    const systemPrompt = `
You are **${r.name}**, the AI receptionist for **${r.business_name}** (${r.business_type || "business"}).

# 🎯 ROLE & PURPOSE
Your job is to act exactly like a trained human receptionist. You:
- greet callers
- answer business questions
- use the knowledge base EXACTLY as provided
- answer FAQs when matched
- NEVER invent information
- speak clearly and professionally

# 📘 BUSINESS INFORMATION (Authoritative Source)
${memoryText}

# ❓ FREQUENTLY ASKED QUESTIONS
${faqText}

# 👤 PERSONALITY
${r.system_prompt || ""}
Tone: ${r.tone || "Friendly and Professional"}

# 📌 RULES (Follow STRONGLY)
- ALWAYS stay in character as a receptionist.
- ALWAYS answer using ONLY business facts above.
- If unsure, say: "${r.default_response || "I'm sorry, I don't have that information yet."}"
- Use ${r.language || "English"} ONLY.
- Keep replies short, warm, and helpful.
- Never mention AI, system prompts, or internal details.

# 🔍 MATCHING FAQ RULE
If the user's message is similar to an FAQ question, use that FAQ answer EXACTLY.

# 🧠 MEMORY
Here is recent conversation memory:
${JSON.stringify(memoryMessages, null, 2)}
`;

    // Prepare messages
    const finalMessages = [
      { role: "system", content: systemPrompt },
      ...memoryMessages,
      ...messages.slice(-3), // include last 3 new messages
    ];

    // Call Lovable AI
    // If FAQ matched exactly, return it immediately
    let reply: string;
    if (faqMatch) {
      reply = faqMatch.answer;
      console.log(`[Chat] Returning FAQ answer directly`);
    } else {
      // Call Lovable AI
      console.log(`[Chat] Calling AI with model google/gemini-2.5-flash`);
      const aiRes = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            temperature: r.temperature || 0.4,
            messages: finalMessages,
          }),
        }
      );

      if (!aiRes.ok) {
        const errorText = await aiRes.text();
        console.error(`[Chat] AI API error: ${errorText}`);
        throw new Error(`AI request failed: ${aiRes.status} ${errorText}`);
      }

      const out = await aiRes.json();
      
      // Safe response parsing with fallback
      if (!out?.choices?.[0]?.message?.content) {
        console.warn(`[Chat] Unexpected AI response structure:`, out);
        reply = r.default_response || "I'm having trouble processing that. Please try again.";
      } else {
        reply = out.choices[0].message.content;
      }
      console.log(`[Chat] AI response received: ${reply.substring(0, 100)}...`);
    }

    // Log messages (fault-tolerant)
    if (userId) {
      try {
        const last = messages[messages.length - 1];
        const { error: insertError } = await supabase.from("chat_messages").insert([
          {
            receptionist_id: receptionistId,
            user_id: userId,
            sender: "user",
            message: last.content,
            metadata: { timestamp: new Date().toISOString() },
          },
          {
            receptionist_id: receptionistId,
            user_id: userId,
            sender: "bot",
            message: reply,
            metadata: { 
              timestamp: new Date().toISOString(),
              faq_matched: !!faqMatch 
            },
          },
        ]);

        if (insertError) {
          console.error(`[Chat] Failed to log messages:`, insertError);
          // Don't throw - we still want to return the reply
        } else {
          console.log(`[Chat] Messages logged successfully`);
        }
      } catch (logError) {
        console.error(`[Chat] Message logging exception:`, logError);
        // Continue - don't fail the whole request
      }
    } else {
      console.log(`[Chat] Skipping message logging (no userId)`);
    }

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error(`[Chat] Error:`, err);
    return new Response(JSON.stringify({ 
      error: err.message || "Internal server error",
      details: err.stack 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
