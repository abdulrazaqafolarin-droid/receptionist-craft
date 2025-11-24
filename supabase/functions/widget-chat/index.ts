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

    console.log(`[Widget Chat] Processing message for receptionist ${receptionistId}, session: ${sessionId}`);

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

    // Fetch conversation history (last 20 messages for better context)
    const { data: history } = await supabase
      .from("chat_messages")
      .select("sender, message")
      .eq("receptionist_id", receptionistId)
      .eq("user_id", sessionId || "anonymous")
      .order("created_at", { ascending: true })
      .limit(20);

    // Fetch FAQs
    const { data: faqs } = await supabase
      .from("receptionist_faqs")
      .select("question, answer")
      .eq("receptionist_id", receptionistId)
      .order("priority", { ascending: false});

    // Fetch services
    const { data: services } = await supabase
      .from("services")
      .select("name, description, duration_minutes")
      .eq("receptionist_id", receptionistId)
      .eq("active", true);

    const faqText = faqs && faqs.length > 0
      ? faqs.map((f: any) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n")
      : "No FAQs provided.";

    const servicesText = services && services.length > 0
      ? services.map((s: any) => `- ${s.name}${s.description ? `: ${s.description}` : ''} (${s.duration_minutes} minutes)`).join('\n')
      : "No services configured.";

    const memoryText = receptionist.knowledge_base || 
      (typeof receptionist.business_info === "string" 
        ? receptionist.business_info 
        : JSON.stringify(receptionist.business_info || {}, null, 2));

    // Detect urgency keywords
    const urgencyKeywords = ["pain", "hurts", "hurt", "bleeding", "emergency", "urgent", "broken", "swollen", "can't eat", "can't sleep", "severe", "immediately"];
    const hasUrgency = urgencyKeywords.some(k => message.toLowerCase().includes(k));
    const urgencyLevel = hasUrgency ? "HIGH - Customer needs immediate attention" : "NORMAL";

    // Extract context from conversation
    const extractContext = (text: string) => {
      const serviceMentioned = text.match(/(?:need|want|book|schedule|appointment for)\s+(?:a\s+)?([a-z\s]+)/i)?.[1]?.trim() || null;
      const dateMentioned = text.match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|next week)/i)?.[0] || null;
      const timeMentioned = text.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))/i)?.[0] || null;
      return { serviceMentioned, dateMentioned, timeMentioned };
    };

    const context = extractContext(message);
    const contextBlock = `
# CURRENT CONTEXT
Service mentioned: ${context.serviceMentioned || "Not yet specified"}
Date mentioned: ${context.dateMentioned || "Not yet specified"}
Time mentioned: ${context.timeMentioned || "Not yet specified"}
Urgency level: ${urgencyLevel}
`;

    const systemPrompt = `You are ${receptionist.name}, the AI receptionist for ${receptionist.business_name}${
      receptionist.business_type ? ` (a ${receptionist.business_type})` : ''
    }.

🎭 YOUR PERSONALITY:
You are ${receptionist.tone || 'friendly and professional'}, warm, empathetic, and genuinely helpful. You communicate like a real human receptionist—not a robot. You can engage in small talk, show understanding, and adjust your tone based on the customer's emotions.

${receptionist.greeting_message ? `Your greeting: "${receptionist.greeting_message}"` : ''}
${receptionist.persona_description ? `About you: ${receptionist.persona_description}` : ''}

📞 BUSINESS INFORMATION:
- Phone: ${receptionist.business_phone || receptionist.phone || 'Not available'}
- Timezone: ${receptionist.timezone || 'UTC'}
${receptionist.address ? `- Address: ${receptionist.address}` : ''}
${receptionist.website ? `- Website: ${receptionist.website}` : ''}

💼 AVAILABLE SERVICES:
${servicesText}

❓ FREQUENTLY ASKED QUESTIONS:
${faqText}

${receptionist.knowledge_base ? `📚 ADDITIONAL KNOWLEDGE:\n${receptionist.knowledge_base}` : ''}

🎯 CONVERSATION GUIDELINES:

1. **Be Human-Like**: Use natural language, contractions, and conversational phrases. Show empathy and understanding.

2. **Context Awareness**: Remember what the customer has already told you in this conversation. Reference previous messages naturally.

3. **Urgency Detection**: Watch for urgent keywords (pain, bleeding, emergency, urgent, broken, swollen, ASAP, immediately, now). If detected, prioritize their request and show concern:
   - "I understand this is urgent. Let me help you right away."
   - Offer the soonest available times
   - Show empathy: "I'm sorry you're dealing with this."

4. **Tone Adjustment**: Match the customer's energy and emotions:
   - Worried customer → Reassuring and calm
   - Frustrated customer → Understanding and solution-focused  
   - Excited customer → Enthusiastic and positive
   - Casual customer → Friendly and relaxed

5. **Booking Flow** (Natural, conversational approach):
   - If they want to book, guide them naturally:
     * "What service can I help you with today?"
     * "When would work best for you?"
     * "Which time slot works better for you?"
     * "Can I get your name and contact info to confirm the booking?"
   - If a slot is unavailable: "That time is taken, but I have [alternative] available. Would that work?"
   - NEVER use technical commands like "accept_alternative:1" - always speak naturally

6. **Small Talk**: Feel free to engage briefly in small talk if the customer initiates it. Be personable.

7. **Clarifying Questions**: If you need more info, ask naturally: "Just to make sure I understand, are you looking for...?"

8. **Empathy**: Show understanding of their situation:
   - "I can imagine how frustrating that must be."
   - "I'm here to help make this as easy as possible."
   - "I totally understand!"

9. **Honesty**: If you don't know something, be upfront: "I'm not sure about that, but I can help you get in touch with someone who does!"

10. **Memory**: Reference previous parts of the conversation naturally:
    - "You mentioned earlier that..."
    - "Based on what you told me about..."

${contextBlock}

Remember: You're not just processing requests—you're building relationships and making customers feel heard and valued. Be conversational, empathetic, and genuinely helpful. You represent ${receptionist.business_name}, and you care about every customer's experience.`;

    const startTime = Date.now();

    // Build conversation messages array with history
    const conversationMessages = [
      { role: "system", content: systemPrompt },
      ...(history || []).map((h: any) => ({
        role: h.sender === "bot" ? "assistant" : "user",
        content: h.message
      })),
      { role: "user", content: message }
    ];

    // Call AI with higher temperature for more natural, varied responses
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: receptionist.model || "google/gemini-2.5-flash",
        messages: conversationMessages,
        temperature: 0.9, // Higher temperature for more natural conversations
        max_tokens: 600
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

    // Store user message in chat history
    await supabase.from("chat_messages").insert({
      receptionist_id: receptionistId,
      session_id: sessionId || "default",
      user_id: sessionId || "anonymous",
      sender: "user",
      message: message,
      metadata: { timestamp: new Date().toISOString() }
    });

    // Store bot reply in chat history
    await supabase.from("chat_messages").insert({
      receptionist_id: receptionistId,
      session_id: sessionId || "default",
      user_id: sessionId || "anonymous",
      sender: "bot",
      message: reply,
      metadata: { timestamp: new Date().toISOString(), latency_ms: latencyMs }
    });

    // Log conversation (for analytics)
    await supabase.from("conversations").insert({
      receptionist_id: receptionistId,
      user_message: message,
      bot_message: reply,
      direction: "inbound",
      metadata: { 
        channel: "widget",
        session_id: sessionId,
        latency_ms: latencyMs,
        urgency_detected: hasUrgency
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
