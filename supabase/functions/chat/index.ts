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

    if (!messages || !Array.isArray(messages)) {
      throw new Error("Messages array is required");
    }
    if (!receptionistId) {
      throw new Error("Receptionist ID is required");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY missing");
    }

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

    // Fetch last 20 messages only for THIS receptionist
    const { data: history } = await supabase
      .from("chat_messages")
      .select("sender, message")
      .eq("receptionist_id", receptionistId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(20);

    // Convert DB memory → chat format
    const memoryMessages = (history || []).map((h) => ({
      role: h.sender === "bot" ? "assistant" : "user",
      content: h.message,
    }));

    // FAQ text
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
      throw new Error("AI request failed");
    }

    const out = await aiRes.json();
    const reply = out.choices[0].message.content;

    // Log messages
    if (userId) {
      const last = messages[messages.length - 1];

      await supabase.from("chat_messages").insert([
        {
          receptionist_id: receptionistId,
          user_id: userId,
          sender: "user",
          message: last.content,
        },
        {
          receptionist_id: receptionistId,
          user_id: userId,
          sender: "bot",
          message: reply,
        },
      ]);
    }

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
