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

    // Fetch conversation history (last 10 messages)
    const { data: history } = await supabase
      .from("chat_messages")
      .select("sender, message")
      .eq("receptionist_id", receptionistId)
      .eq("session_id", sessionId || "default")
      .order("created_at", { ascending: true })
      .limit(10);

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

    const systemPrompt = `
You are **${receptionist.name}**, a warm, friendly, and professional receptionist for **${receptionist.business_name}**.

# 👤 PERSONALITY
- Warm, empathetic, and conversational
- You can engage in short natural small talk (greetings, well-wishes, weather)
- You adjust tone based on customer emotion
- You detect urgency and react appropriately with concern and priority
- You remember earlier parts of the conversation
- Tone: ${receptionist.tone || "Friendly and Professional"}
- Language: ${receptionist.language || "English"}

# 💬 CONVERSATION GUIDELINES
- Greet warmly and ask how you can help
- Show empathy when customer expresses pain, frustration, or confusion
- Confirm understanding before taking action
- Offer helpful suggestions proactively
- Close conversations with friendly sign-offs
- Use natural, conversational language - NOT robotic or overly formal

# 🚫 MESSAGES YOU SHOULD AVOID
- Robotic or overly formal tone
- Ignoring emotional cues
- Forgetting context from previous messages
- Making up facts not in the business information

# 🚨 URGENCY DETECTION
If customer mentions: "pain", "hurts", "bleeding", "emergency", "urgent", "broken", "swollen", "can't eat", "can't sleep"
→ Respond with genuine concern, acknowledge their discomfort, and prioritize the earliest available appointment.

# 📘 BUSINESS INFORMATION
${memoryText}

# ❓ FREQUENTLY ASKED QUESTIONS
${faqText}

# 📅 BOOKING FLOW RULES
When a customer wants to book an appointment, follow this natural flow:

**IMPORTANT: The customer will use interactive buttons and pickers for most booking actions.**
Your job is to guide them conversationally and respond to their selections.

1. **Service Selection**: 
   - Ask "What service do you need?" 
   - They'll click a service card (you'll receive: "I'd like to book [Service Name]")
   
2. **Date Selection**:
   - Ask "What day works best for your [service] appointment?"
   - They'll use a calendar picker (you'll receive: "I'd like an appointment on [date]")
   
3. **Time Selection**:
   - Say "These times are available on [date]. Which works best?"
   - They'll click a time button (you'll receive the selected time)
   
4. **Contact Collection**:
   - After time is selected, ask: "Perfect! Who should I book the appointment under?"
   - Then ask: "Great! And what's the best phone number to reach you?"

**Use natural language throughout:**
- ✅ "That time is booked, but I have Tuesday at 2:00 PM or Wednesday at 9:00 AM available. Which works better for you?"
- ❌ Never use technical commands like "Reply with 'accept_alternative:1'"

${contextBlock}

Remember: You represent ${receptionist.business_name}. Be warm, professional, and genuinely helpful!
`;

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

    // Call AI with increased creativity
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: conversationMessages,
        temperature: 0.9
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
