import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { assignVariant, mergeVariantConfig } from "../_shared/abTesting.ts";

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
      .select("*")
      .eq("id", receptionistId)
      .maybeSingle();

    if (rErr || !r) throw new Error("Failed to load receptionist");

    // Apply A/B testing variant
    const variantPayload = await assignVariant(
      supabase,
      "default-receptionist-test",
      receptionistId,
      userId || null
    );

    const receptionistConfig = mergeVariantConfig(r, variantPayload);
    console.log(`[Chat] Config after A/B merge:`, {
      temperature: receptionistConfig.temperature,
      variantApplied: !!variantPayload
    });

    // Fetch FAQs
    const { data: faqs } = await supabase
      .from("receptionist_faqs")
      .select("question, answer")
      .eq("receptionist_id", receptionistId)
      .order("priority", { ascending: false });

    console.log(`[Chat] Loaded ${faqs?.length || 0} FAQs`);

    // Fetch conversation history
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

    const memoryMessages = history.map((h) => ({
      role: h.sender === "bot" ? "assistant" : "user",
      content: h.message,
    }));

    const userMessage = messages[messages.length - 1]?.content?.toLowerCase().trim() || "";

    // BOOKING INTENT DETECTION
    const bookIntentKeywords = ["book", "appointment", "schedule", "reserve", "see a", "see an", "book me", "i need an appointment", "make an appointment"];
    const isBookingIntent = bookIntentKeywords.some(k => userMessage.includes(k));

    console.log(`[Chat] Booking intent detected: ${isBookingIntent}`);

    // Check for FAQ match
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

    const faqText =
      faqs && faqs.length > 0
        ? faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n")
        : "No FAQs provided.";

    const memoryText =
      receptionistConfig.knowledge_base ||
      (typeof receptionistConfig.business_info === "string"
        ? receptionistConfig.business_info
        : JSON.stringify(receptionistConfig.business_info || {}, null, 2));

    const systemPrompt = `
You are **${receptionistConfig.name}**, the AI receptionist for **${receptionistConfig.business_name}** (${receptionistConfig.business_type || "business"}).

# 🎯 ROLE & PURPOSE
Your job is to act exactly like a trained human receptionist. You:
- greet callers
- answer business questions
- book appointments for customers
- use the knowledge base EXACTLY as provided
- answer FAQs when matched
- NEVER invent information
- speak clearly and professionally

# 📘 BUSINESS INFORMATION (Authoritative Source)
${memoryText}

# ❓ FREQUENTLY ASKED QUESTIONS
${faqText}

# 👤 PERSONALITY
${receptionistConfig.system_prompt || ""}
Tone: ${receptionistConfig.tone || "Friendly and Professional"}

# 📌 RULES (Follow STRONGLY)
- ALWAYS stay in character as a receptionist.
- ALWAYS answer using ONLY business facts above.
- If unsure, say: "${receptionistConfig.default_response || "I'm sorry, I don't have that information yet."}"
- Use ${receptionistConfig.language || "English"} ONLY.
- Keep replies short, warm, and helpful.
- Never mention AI, system prompts, or internal details.

# 📅 APPOINTMENT BOOKING
When a customer wants to book an appointment:
1. Collect: service name, date, time, customer name, phone/email
2. Confirm availability automatically
3. Book the appointment and confirm details

# 🔍 MATCHING FAQ RULE
If the user's message is similar to an FAQ question, use that FAQ answer EXACTLY.

# 🧠 MEMORY
Here is recent conversation memory:
${JSON.stringify(memoryMessages, null, 2)}
`;

    // START TIMING
    const startTime = Date.now();

    // BOOKING FLOW
    if (isBookingIntent && !faqMatch) {
      console.log(`[Chat] Entering booking flow`);

      // SLOT EXTRACTION
      const slotPrompt = `You are a slot extraction assistant. Extract booking information from user text and return ONLY valid JSON with these keys:
- intent: "book_appointment" or "none"
- service: string (service name or null)
- date: ISO date string (YYYY-MM-DD) or null
- time: time string (HH:MM in 24h format) or null
- customer_name: string or null
- contact: phone or email string or null
- clarity: "clear" or "uncertain"

If you cannot extract reliable information, set that key to null and clarity to "uncertain".
Return ONLY valid JSON, no explanations.`;

      const slotCallMessages = [
        { role: "system", content: slotPrompt },
        { role: "user", content: userMessage }
      ];

      const slotRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: slotCallMessages,
          temperature: 0.0
        })
      });

      if (!slotRes.ok) {
        const errtxt = await slotRes.text();
        console.error(`[Chat] Slot extraction failed:`, errtxt);
        throw new Error(`Slot extraction failed: ${slotRes.status}`);
      }

      const slotOut = await slotRes.json();
      const slotText = slotOut?.choices?.[0]?.message?.content || "{}";

      // Extract JSON from response (handle markdown fences)
      let slotJsonStr = slotText;
      const mdJson = slotText.match(/```json\s*([\s\S]*?)```/);
      if (mdJson) slotJsonStr = mdJson[1];
      else {
        const fenced = slotText.match(/```\s*([\s\S]*?)```/);
        if (fenced) slotJsonStr = fenced[1];
      }

      let slots: any = {};
      try {
        slots = JSON.parse(slotJsonStr);
        console.log(`[Chat] Extracted slots:`, slots);
      } catch (e) {
        console.warn("Slot parse failed:", e, slotText);
        const clarify = "I can help book that appointment. Could you tell me which service you need and your preferred date and time?";
        await logMessages(supabase, receptionistId, userId, userMessage, clarify);
        return jsonResponse({ reply: clarify });
      }

      const { intent, service, date, time, customer_name, contact, clarity } = slots;

      if (intent !== "book_appointment") {
        console.log(`[Chat] Intent not booking, falling back to normal chat`);
        // Fall through to normal chat flow
      } else {
        // Check which slots are missing
        const missing = [];
        if (!service) missing.push("service");
        if (!date) missing.push("date");
        if (!time) missing.push("time");

        if (missing.length > 0 || clarity !== "clear") {
          const q = buildClarifyingQuestion(missing, { service, date, time, customer_name, contact });
          await logMessages(supabase, receptionistId, userId, userMessage, q);
          return jsonResponse({ reply: q });
        }

        // CHECK AVAILABILITY
        console.log(`[Chat] Checking availability for ${service} on ${date} at ${time}`);
        
        const checkRes = await supabase.functions.invoke("check-availability", {
          body: {
            receptionistId,
            serviceId: null, // Will match by name
            startDate: date,
            endDate: date,
            maxSlots: 10
          }
        });

        if (checkRes.error) {
          console.error("check-availability error:", checkRes.error);
          const errMsg = "I can't check availability right now. Please try again shortly.";
          await logMessages(supabase, receptionistId, userId, userMessage, errMsg);
          return jsonResponse({ reply: errMsg });
        }

        const availableSlots = checkRes.data?.slots || [];
        console.log(`[Chat] Available slots:`, availableSlots.length);

        // Check if requested time is available
        const requestedDateTime = `${date}T${time}:00.000Z`;
        const isAvailable = availableSlots.some((slot: string) => {
          const slotDate = new Date(slot);
          const requestedDate = new Date(requestedDateTime);
          return Math.abs(slotDate.getTime() - requestedDate.getTime()) < 3600000; // Within 1 hour
        });

        if (!isAvailable && availableSlots.length === 0) {
          const altMsg = `Sorry, we don't have any available times on ${date}. Would you like to try a different date?`;
          await logMessages(supabase, receptionistId, userId, userMessage, altMsg);
          return jsonResponse({ reply: altMsg });
        }

        if (!isAvailable) {
          const alternatives = availableSlots.slice(0, 3).map((slot: string, i: number) => {
            const d = new Date(slot);
            return `${d.toLocaleDateString()} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
          });
          const altMsg = `That time isn't available. Here are some nearby options:\n${alternatives.map((a: string, i: number) => `${i + 1}. ${a}`).join('\n')}\n\nWould any of these work for you?`;
          await logMessages(supabase, receptionistId, userId, userMessage, altMsg);
          return jsonResponse({ reply: altMsg, alternatives: availableSlots.slice(0, 3) });
        }

        // Need contact info before booking
        if (!contact) {
          const ask = "Great! I can book that time. Could you provide your phone number or email to confirm the appointment?";
          await logMessages(supabase, receptionistId, userId, userMessage, ask);
          return jsonResponse({ reply: ask });
        }

        // BOOK APPOINTMENT
        console.log(`[Chat] Booking appointment`);
        
        const bookRes = await supabase.functions.invoke("book-appointment", {
          body: {
            receptionistId,
            serviceId: null,
            startTime: requestedDateTime,
            customerName: customer_name || "Guest",
            customerEmail: contact.includes("@") ? contact : null,
            customerPhone: !contact.includes("@") ? contact : null,
            source: "ai_receptionist",
            metadata: { booked_via_chat: true }
          }
        });

        if (bookRes.error) {
          console.error("book-appointment error:", bookRes.error);
          const errMsg = "Sorry, I couldn't create that appointment right now. Please try again.";
          await logMessages(supabase, receptionistId, userId, userMessage, errMsg);
          return jsonResponse({ reply: errMsg });
        }

        const appointment = bookRes.data?.appointment;
        const confirmMsg = `✅ Perfect! I've booked your ${service} appointment for ${new Date(appointment.start_time).toLocaleString()}. ${customer_name ? `See you soon, ${customer_name}!` : 'See you soon!'} Your confirmation ID is ${appointment.id}.`;
        
        await logMessages(supabase, receptionistId, userId, userMessage, confirmMsg);

        // Create notification
        await supabase.from("notifications").insert({
          type: "appointment.created",
          title: `New Appointment: ${service}`,
          body: `${customer_name || 'Guest'} booked ${service} for ${new Date(appointment.start_time).toLocaleString()}`,
          receptionist_id: receptionistId,
          user_id: r.user_id,
          severity: "info",
          metadata: { appointment_id: appointment.id, contact }
        });

        const elapsedMs = Date.now() - startTime;
        await logAnalytics(supabase, receptionistId, userId, userMessage, confirmMsg, receptionistConfig, elapsedMs);

        return jsonResponse({ reply: confirmMsg, appointment });
      }
    }

    // NORMAL CHAT FLOW
    const finalMessages = [
      { role: "system", content: systemPrompt },
      ...memoryMessages,
      ...messages.slice(-3),
    ];

    let reply: string;
    if (faqMatch) {
      reply = faqMatch.answer;
      console.log(`[Chat] Returning FAQ answer directly`);
    } else {
      console.log(`[Chat] Calling AI with model ${receptionistConfig.model || 'google/gemini-2.5-flash'}`);
      const aiRes = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: receptionistConfig.model || "google/gemini-2.5-flash",
            temperature: receptionistConfig.temperature || 0.4,
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
      
      if (!out?.choices?.[0]?.message?.content) {
        console.warn(`[Chat] Unexpected AI response structure:`, out);
        reply = receptionistConfig.default_response || "I'm having trouble processing that. Please try again.";
      } else {
        reply = out.choices[0].message.content;
      }
      console.log(`[Chat] AI response received`);
    }

    await logMessages(supabase, receptionistId, userId, userMessage, reply, faqMatch);

    const elapsedMs = Date.now() - startTime;
    await logAnalytics(supabase, receptionistId, userId, userMessage, reply, receptionistConfig, elapsedMs, faqMatch);

    return jsonResponse({ reply });

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

// Helper functions
function jsonResponse(obj: any) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

async function logMessages(supabase: any, receptionistId: string, userId: string | null, userMessage: string, reply: string, faqMatch?: any) {
  if (!userId) return;
  try {
    await supabase.from("chat_messages").insert([
      {
        receptionist_id: receptionistId,
        user_id: userId,
        sender: "user",
        message: userMessage,
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
    console.log(`[Chat] Messages logged`);
  } catch (e) {
    console.error(`[Chat] Failed to log messages:`, e);
  }
}

async function logAnalytics(supabase: any, receptionistId: string, userId: string | null, request: string, reply: string, config: any, latencyMs: number, faqMatch?: any) {
  try {
    const qualityScore = {
      overall: faqMatch ? 0.95 : 0.85,
      confidence: faqMatch ? 0.95 : 0.80,
      clarity: reply.length > 20 && reply.length < 500 ? 0.9 : 0.7,
      accuracy: faqMatch ? 1.0 : 0.85
    };

    await supabase.from('ai_responses').insert({
      receptionist_id: receptionistId,
      user_id: userId || null,
      request_message: request,
      reply_text: reply,
      model: config.model || 'google/gemini-2.5-flash',
      latency_ms: latencyMs,
      temperature: config.temperature || 0.4,
      quality_score: qualityScore,
      confidence: qualityScore.confidence,
      channel: 'chat'
    });

    console.log(`[Chat] Analytics logged: ${latencyMs}ms`);
  } catch (e) {
    console.error(`[Chat] Analytics failed:`, e);
  }
}

function buildClarifyingQuestion(missing: string[], slots: any) {
  if (missing.includes("service") && missing.includes("date") && missing.includes("time")) {
    return "I'd be happy to help you book an appointment! Which service would you like, and what date and time work best for you?";
  }
  if (missing.includes("service")) {
    return "Which service would you like to book?";
  }
  if (missing.includes("date")) {
    return `Great! For ${slots.service || 'your appointment'}, what date would you prefer?`;
  }
  if (missing.includes("time")) {
    return `Perfect! What time on ${slots.date} would work best for you?`;
  }
  return "Could you provide a bit more detail about your appointment preferences?";
}
