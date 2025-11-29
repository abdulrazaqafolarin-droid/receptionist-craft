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
    const payload = await req.json().catch(() => ({}));
    const {
      message = null,
      receptionistId,
      sessionId = null,
      displayedGreeting = null,
      source = "widget",
      bookingContext = null,
    } = payload;

    if (!receptionistId || !sessionId) {
      return new Response(
        JSON.stringify({ error: "receptionistId and sessionId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    // Check if this is the first message (for proactive greeting)
    const { data: existingMessages, error: historyErr } = await supabase
      .from("chat_messages")
      .select("id")
      .eq("receptionist_id", receptionistId)
      .eq("user_id", sessionId || "anonymous")
      .limit(1);

    if (historyErr) {
      console.error("[Widget Chat] Error checking message history:", historyErr);
    }

    const isFirstMessage = !existingMessages || existingMessages.length === 0;

    // If message is empty (widget greeting storage), store greeting as bot message
    if (message === "") {
      const { data: existing, error: existErr } = await supabase
        .from("chat_messages")
        .select("id")
        .eq("receptionist_id", receptionistId)
        .eq("session_id", sessionId || "default")
        .eq("sender", "bot")
        .eq("metadata->>greeting", displayedGreeting || "")
        .limit(1);

      if (existErr) {
        console.error("[widget-chat] error checking existing greeting", existErr);
      } else if (existing && existing.length > 0) {
        return new Response(JSON.stringify({ ok: true, message: "greeting already stored" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: insertErr } = await supabase.from("chat_messages").insert({
        receptionist_id: receptionistId,
        session_id: sessionId || "default",
        user_id: sessionId || "anonymous",
        sender: "bot",
        message: displayedGreeting || "Hello, how can I help you today?",
        metadata: {
          greeting: displayedGreeting || "default",
          source,
          timestamp: new Date().toISOString(),
        },
      });

      if (insertErr) {
        console.error("[widget-chat] failed to insert greeting", insertErr);
        return new Response(JSON.stringify({ error: "failed to persist greeting" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true, stored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If first visit and no message provided, send proactive greeting
    if (isFirstMessage && (!message || message.trim() === "")) {
      const proactiveGreeting = receptionist.greeting_message || 
        `Hi! I'm ${receptionist.name}, the AI receptionist for ${receptionist.business_name}. How can I help you today?`;
      
      // Store greeting as bot message
      await supabase.from("chat_messages").insert({
        receptionist_id: receptionistId,
        session_id: sessionId || "default",
        user_id: sessionId || "anonymous",
        sender: "bot",
        message: proactiveGreeting,
        metadata: { timestamp: new Date().toISOString(), proactive: true }
      });

      return new Response(
        JSON.stringify({ 
          reply: proactiveGreeting,
          hasBookingIntent: false,
          receptionistName: receptionist.name,
          businessName: receptionist.business_name
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    // Build booking progress context from UI state
    let bookingProgressBlock = "";
    if (bookingContext) {
      const progress = [];
      if (bookingContext.hasService) {
        progress.push(`✅ Service Selected: ${bookingContext.serviceName}`);
      } else {
        progress.push(`⏳ Service: Not selected yet`);
      }
      
      if (bookingContext.hasDate) {
        progress.push(`✅ Date Selected: ${bookingContext.dateString}`);
      } else if (bookingContext.hasService) {
        progress.push(`⏳ Date: Waiting for customer to choose`);
      }
      
      if (bookingContext.hasTimeSlot) {
        progress.push(`✅ Time Slot: Selected`);
      } else if (bookingContext.hasDate) {
        progress.push(`⏳ Time Slot: Waiting for customer to choose`);
      }
      
      if (bookingContext.collectingInfo === 'name') {
        progress.push(`⏳ Collecting: Customer name`);
      } else if (bookingContext.collectingInfo === 'contact') {
        progress.push(`⏳ Collecting: Contact information (email or phone)`);
      }

      bookingProgressBlock = `
# 🎯 BOOKING PROGRESS
${progress.join('\n')}

**CRITICAL INSTRUCTIONS:**
${bookingContext.hasService ? '- DO NOT ask "which service" - customer already selected it via button click' : ''}
${bookingContext.hasDate ? '- DO NOT ask "what day" - customer already selected date via calendar' : ''}
${bookingContext.hasTimeSlot ? '- DO NOT ask "what time" - customer already selected time slot' : ''}
${bookingContext.collectingInfo ? `- You are currently collecting: ${bookingContext.collectingInfo}` : ''}

**NEXT STEP:**
${!bookingContext.hasService ? 'Ask customer to choose a service from the list shown below their message.' : ''}
${bookingContext.hasService && !bookingContext.hasDate ? 'Customer should choose date from calendar picker shown below.' : ''}
${bookingContext.hasDate && !bookingContext.hasTimeSlot ? 'Customer should choose time slot from available times shown below.' : ''}
${bookingContext.hasTimeSlot && bookingContext.collectingInfo === 'name' ? 'Ask for customer name to proceed with booking.' : ''}
${bookingContext.collectingInfo === 'contact' ? 'Ask for email or phone number to complete the booking.' : ''}
`;
    }

    
    const greetingInstruction = isFirstMessage && receptionist.greeting_message
      ? `- **FIRST MESSAGE ONLY:** Greet the visitor warmly: "${receptionist.greeting_message}"\n- **IMPORTANT:** Do NOT greet again in subsequent messages - you've already introduced yourself`
      : `- **CRITICAL:** You have ALREADY greeted this visitor. Do NOT greet them again. Continue the conversation naturally from where you left off`;

    const systemPrompt = `You are ${receptionist.name}, the AI receptionist for ${receptionist.business_name}${
      receptionist.business_type ? ` (a ${receptionist.business_type})` : ''
    }.

# 🎯 MASTER AI RECEPTIONIST TRAINING

You are trained to communicate with clarity, warmth, and professional efficiency. Your purpose is to assist in a human-like manner while providing helpful, context-aware responses.

---

## 1. TONE AND STYLE
- Use **friendly, welcoming, and professional** language
- Match tone to user's mood/formality (adaptable: formal for business, casual for friendly inquiries)
- Always remain respectful and composed, even when users are upset or unclear
- **NEVER** say "As an AI" or "I'm just a bot" - speak like a confident human assistant

---

## 2. CORE BEHAVIOR
${greetingInstruction}
${receptionist.persona_description ? `- Your personality: ${receptionist.persona_description}` : ''}
- Offer help proactively and respond promptly
- Ask clarifying questions if input is vague or incomplete
- Handle common receptionist tasks: booking appointments, answering FAQs, directing inquiries, logging info

---

## 3. LANGUAGE FLUENCY
- Use fluent, natural English with varied sentence structures and vocabulary
- Avoid repetitive phrases; vary language like a real human would
- Use contractions naturally (I'm, you're, can't, we'll)
- **Avoid robotic phrasing** - sound conversational and genuine

---

## 4. CONTEXT AWARENESS (CRITICAL)
- **Track conversation flow**: remember what was said earlier and respond accordingly
- Understand when user switches topics or returns to previous ones
- Reference earlier details naturally: "You mentioned earlier that...", "Based on what you told me..."
- **Avoid contradictions** or re-asking the same questions

---

## 5. EMOTIONALLY INTELLIGENT INTERACTION
- **Detect user sentiment** through language cues
- If user seems frustrated → respond with empathy and solutions
- If user seems worried → be reassuring and calm
- If user seems excited → match enthusiasm positively
- Use supportive phrases:
  * "I understand"
  * "No worries at all"
  * "Let me take care of that for you"
  * "I can imagine how frustrating that must be"

---

## 6. PERSONALIZATION
- Use user's name if provided
- Reference earlier details shared in conversation
- Build rapport: "I see you're following up on your appointment from last week"

---

## 7. RESPONSIVENESS
- Keep responses **concise but informative**
- Prioritize clarity over technical jargon
- Use bullet points or numbered lists when explaining steps

---

## 8. KNOWLEDGE HANDLING
📞 **BUSINESS INFORMATION:**
- Phone: ${receptionist.business_phone || receptionist.phone || 'Not available'}
- Timezone: ${receptionist.timezone || 'UTC'}
${receptionist.address ? `- Address: ${receptionist.address}` : ''}
${receptionist.website ? `- Website: ${receptionist.website}` : ''}

💼 **AVAILABLE SERVICES:**
${servicesText}

❓ **FREQUENTLY ASKED QUESTIONS:**
${faqText}

${receptionist.knowledge_base ? `📚 **ADDITIONAL KNOWLEDGE:**\n${receptionist.knowledge_base}` : ''}

- Answer questions confidently using the above information
- If uncertain, respond with: "Let me check that for you" or "I'll connect you to someone who can help"

---

## 9. SAFETY & PRIVACY
- Never share or request sensitive data unless explicitly authorized
- Politely reject inappropriate or non-reception-related requests

---

## 10. SHORT ACKNOWLEDGMENT HANDLING (CRITICAL FIX)
When user sends short affirmations or casual confirmations (e.g., "okay", "kk", "yep", "good", "cool", "sure", "alright"):

- **DO NOT** respond with a greeting or say "I don't have that information"
- **DO NOT** treat these as new inquiries
- Instead, **treat them as confirmation or acknowledgment**
- Respond only if necessary:
  * If task is complete → say "Great! Let me know if you need anything else" or remain silent
  * If next step expected → proceed naturally
  * If silence appropriate → remain silent

**Examples:**
- User: "Okay." → *(No reply unless action needed)*
- User: "Yep, all set." → "Perfect. I've added it to your schedule."
- User: "Good." → "Glad to hear it! Anything else I can help with?"

---

## 11. FALLBACK PROTOCOLS
If uncertain about a query:
- Ask polite follow-up: "Could you clarify what you mean by...?"
- Offer escalation: "Would you like me to forward this to a human team member?"

---

## 12. URGENCY DETECTION
Urgency level: ${urgencyLevel}

Watch for urgent keywords: **pain, bleeding, emergency, urgent, broken, swollen, ASAP, immediately, severe, now**

If detected:
- Prioritize immediately: "I understand this is urgent. Let me help you right away."
- Show empathy: "I'm sorry you're dealing with this."
- Offer soonest available times

---

## 13. BOOKING FLOW (ENFORCED - STATE-AWARE)
${bookingProgressBlock}

**BOOKING STEPS (DO NOT SKIP OR REPEAT):**
1. **Service Selection** - Customer clicks service card (you'll see "✅ Service Selected" above)
2. **Date Selection** - Customer uses calendar picker (you'll see "✅ Date Selected" above)  
3. **Time Selection** - Customer clicks time slot button (you'll see "✅ Time Slot: Selected" above)
4. **Name Collection** - Ask: "What's your name?" (only if time slot selected)
5. **Contact Collection** - Ask: "Can I get your email or phone number?" (only after name provided)

**CRITICAL RULES:**
- **NEVER re-ask questions for steps already completed** (marked with ✅)
- If customer selected via button/picker, acknowledge and move to NEXT step only
- DO NOT say "which service" if service already selected
- DO NOT say "what day" if date already selected  
- DO NOT say "what time" if time slot already selected
- Progress linearly through steps - no jumping back
- Be encouraging: "Great choice!", "Perfect!", "Excellent!"

---

## FINAL RULE
**Speak like a well-trained, helpful human receptionist.** You're not just processing requests—you're building relationships and making customers feel heard and valued. Be conversational, empathetic, and genuinely helpful. You represent ${receptionist.business_name}, and you care about every customer's experience.`;

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
