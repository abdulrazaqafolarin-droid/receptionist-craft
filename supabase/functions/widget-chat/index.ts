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
    const { message, receptionistId, sessionId } = await req.json();

    if (!message || !receptionistId) {
      throw new Error("Message and receptionistId are required");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY missing");
    }

    console.log(`[Widget Chat] Processing message for receptionist ${receptionistId}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch receptionist
    const { data: receptionist, error: rErr } = await supabase
      .from("receptionists")
      .select("*")
      .eq("id", receptionistId)
      .eq("active", true)
      .maybeSingle();

    if (rErr || !receptionist) {
      throw new Error("Receptionist not found or inactive");
    }

    // Fetch FAQs
    const { data: faqs } = await supabase
      .from("receptionist_faqs")
      .select("question, answer")
      .eq("receptionist_id", receptionistId)
      .order("priority", { ascending: false });

    const faqText = faqs && faqs.length > 0
      ? faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n")
      : "No FAQs provided.";

    const memoryText = receptionist.knowledge_base || 
      (typeof receptionist.business_info === "string" 
        ? receptionist.business_info 
        : JSON.stringify(receptionist.business_info || {}, null, 2));

    const systemPrompt = `
You are **${receptionist.name}**, the AI receptionist for **${receptionist.business_name}**.

# 🎯 ROLE
You are a professional receptionist helping customers:
- Answer questions about the business
- Book appointments
- Provide service information
- Assist with inquiries

# 📘 BUSINESS INFORMATION
${memoryText}

# ❓ FAQS
${faqText}

# 👤 PERSONALITY
Tone: ${receptionist.tone || "Friendly and Professional"}
Language: ${receptionist.language || "English"}

# 📌 RULES
- Stay professional and helpful
- Answer using ONLY the business information provided
- If unsure, say: "${receptionist.default_response || "I don't have that information yet."}"
- Keep responses concise and clear
- For appointments, collect: service, date, time, name, phone/email

# 📅 BOOKING
When customers want to book:
1. Ask for service name
2. Ask for preferred date and time
3. Collect their name and contact info
4. Confirm availability and book

Remember: You represent ${receptionist.business_name}. Be warm, professional, and helpful!
`;

    const startTime = Date.now();

    // Call AI
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ],
        temperature: receptionist.temperature || 0.7
      })
    });

    if (!aiRes.ok) {
      const errTxt = await aiRes.text();
      console.error("AI API error:", aiRes.status, errTxt);
      
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "Service is busy. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ error: "Service temporarily unavailable." }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error("AI request failed");
    }

    const aiData = await aiRes.json();
    const reply = aiData.choices?.[0]?.message?.content || "I'm sorry, I couldn't process that.";

    const latencyMs = Date.now() - startTime;

    // Log conversation (optional, for analytics)
    await supabase.from("conversations").insert({
      receptionist_id: receptionistId,
      user_message: message,
      bot_message: reply,
      direction: "inbound",
      metadata: { 
        channel: "widget",
        session_id: sessionId,
        latency_ms: latencyMs
      }
    });

    // Check if booking intent
    const bookingKeywords = ["book", "appointment", "schedule", "reserve"];
    const hasBookingIntent = bookingKeywords.some(k => message.toLowerCase().includes(k));

    return new Response(
      JSON.stringify({ 
        reply, 
        hasBookingIntent,
        receptionistName: receptionist.name,
        businessName: receptionist.business_name
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Widget chat error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to process request" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
