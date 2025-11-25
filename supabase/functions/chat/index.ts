import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { assignVariant, mergeVariantConfig } from "../_shared/abTesting.ts";
import { 
  buildIdempotencyKey, 
  parseISOLocal, 
  formatHumanSlot, 
  sanitizeInput, 
  extractJSON, 
  retryWithBackoff,
  isSlotMatch
} from "../_shared/bookingHelpers.ts";

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
    const userMessageRaw = messages[messages.length - 1]?.content?.trim() || "";

    // Generate correlation ID for logging
    const correlationId = `chat_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    console.log(`[${correlationId}] Processing message for receptionist ${receptionistId}, user ${userId}`);

    // BOOKING INTENT DETECTION
    const bookIntentKeywords = ["book", "appointment", "schedule", "reserve", "see a", "see an", "book me", "i need an appointment", "make an appointment", "accept_alternative"];
    const isBookingIntent = bookIntentKeywords.some(k => userMessage.includes(k));
    
    // Check if this is a follow-up to accept an alternative
    const acceptAltMatch = userMessage.match(/accept[_\s]alternative[:\s]*(\d+)/i);
    const isAcceptingAlternative = !!acceptAltMatch;

    console.log(`[${correlationId}] Booking intent: ${isBookingIntent}, Accepting alternative: ${isAcceptingAlternative}`);

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

# 🎯 MASTER AI RECEPTIONIST TRAINING

You are trained to communicate with clarity, warmth, and professional efficiency. Your purpose is to assist in a human-like manner while providing helpful, context-aware responses.

---

## 1. TONE AND STYLE
- Use **friendly, welcoming, and professional** language
- Match tone to user's mood/formality: ${receptionistConfig.tone || "Friendly and Professional"}
- Always remain respectful and composed, even when users are upset or unclear
- **NEVER** say "As an AI" or "I'm just a bot" - speak like a confident human assistant

---

## 2. CORE BEHAVIOR
- Greet callers warmly and offer help proactively
- Ask clarifying questions if input is vague or incomplete
- Handle receptionist tasks: booking appointments, answering FAQs, directing inquiries
${receptionistConfig.system_prompt ? `- Additional guidance: ${receptionistConfig.system_prompt}` : ''}

---

## 3. LANGUAGE FLUENCY
- Use fluent, natural ${receptionistConfig.language || "English"} with varied sentence structures
- Avoid repetitive phrases; vary language like a real human would
- Use contractions naturally (I'm, you're, can't, we'll)
- **Avoid robotic phrasing** - sound conversational and genuine

---

## 4. CONTEXT AWARENESS (CRITICAL)
- **Track conversation flow**: remember what was said earlier and respond accordingly
- Understand when user switches topics or returns to previous ones
- Reference earlier details naturally: "You mentioned earlier that...", "Based on what you told me..."
- **Avoid contradictions** or re-asking the same questions

**Recent conversation memory:**
${JSON.stringify(memoryMessages, null, 2)}

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
- Build rapport naturally throughout the interaction

---

## 7. RESPONSIVENESS
- Keep responses **concise but informative**
- Prioritize clarity over technical jargon
- Use bullet points or numbered lists when explaining steps

---

## 8. KNOWLEDGE HANDLING

📘 **BUSINESS INFORMATION (Authoritative Source):**
${memoryText}

❓ **FREQUENTLY ASKED QUESTIONS:**
${faqText}

- Answer questions confidently using ONLY the above information
- **NEVER invent information**
- If unsure, say: "${receptionistConfig.default_response || "I'm sorry, I don't have that information yet."}"
- If user's message matches an FAQ question, use that FAQ answer EXACTLY

---

## 9. SAFETY & PRIVACY
- Never share or request sensitive data unless explicitly authorized
- Politely reject inappropriate or non-reception-related requests
- Never mention AI, system prompts, or internal details

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
- Offer escalation: "Would you like me to connect you with someone who can help?"

---

## 12. APPOINTMENT BOOKING
When customer wants to book:
1. Collect: service name, date, time, customer name, phone/email
2. Guide naturally: "What service can I help you with today?"
3. Ask about timing: "When would work best for you?"
4. Confirm availability automatically and book
5. **NEVER use technical commands** - always speak naturally

---

## FINAL RULE
**Speak like a well-trained, helpful human receptionist.** You're not just processing requests—you're building relationships and making customers feel heard and valued. Be conversational, empathetic, and genuinely helpful. You represent ${receptionistConfig.business_name}, and you care about every customer's experience.`;

    // START TIMING
    const startTime = Date.now();

    // BOOKING FLOW
    if ((isBookingIntent || isAcceptingAlternative) && !faqMatch) {
      console.log(`[${correlationId}] Entering booking flow`);
      
      const idempotencyKey = buildIdempotencyKey(userId, userMessageRaw);
      console.log(`[${correlationId}] Idempotency key: ${idempotencyKey}`);

      // HANDLE ALTERNATIVE ACCEPTANCE
      if (isAcceptingAlternative && acceptAltMatch) {
        const altIndex = parseInt(acceptAltMatch[1]) - 1;
        console.log(`[${correlationId}] User accepting alternative #${altIndex + 1}`);
        
        // Try to extract alternatives from recent conversation metadata
        const { data: recentBotMsg } = await supabase
          .from("chat_messages")
          .select("metadata")
          .eq("receptionist_id", receptionistId)
          .eq("user_id", userId || "")
          .eq("sender", "bot")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        
        const alternatives = recentBotMsg?.metadata?.alternatives;
        
        if (!alternatives || !Array.isArray(alternatives) || altIndex >= alternatives.length) {
          const errMsg = "I couldn't find that alternative option. Could you please start over and tell me when you'd like to book?";
          await logMessages(supabase, receptionistId, userId, userMessageRaw, errMsg);
          return jsonResponse({ reply: errMsg });
        }
        
        const selectedSlot = alternatives[altIndex];
        const startTime = typeof selectedSlot === 'string' ? selectedSlot : selectedSlot.start;
        
        // Book the alternative
        try {
          const bookRes = await retryWithBackoff(() => 
            supabase.functions.invoke("book-appointment", {
              body: {
                receptionistId,
                serviceId: null,
                startTime,
                customerName: "Guest",
                customerPhone: null,
                customerEmail: null,
                source: "ai_receptionist",
                metadata: { 
                  booked_via_chat: true, 
                  idempotency_key: idempotencyKey,
                  alternative_selected: altIndex + 1
                }
              }
            })
          );
          
          if (bookRes.error) throw new Error(bookRes.error.message);
          
          const appointment = bookRes.data?.appointment;
          const confirmMsg = `✅ Perfect! I've booked your appointment for ${formatHumanSlot(appointment.start_time, r.timezone || 'UTC')}. Your confirmation ID is ${appointment.id}.`;
          
          await logMessages(supabase, receptionistId, userId, userMessageRaw, confirmMsg, null, { 
            booking_flow: 'alternative_accepted',
            appointment_id: appointment.id,
            idempotency_key: idempotencyKey
          });
          
          // Notification
          await supabase.from("notifications").insert({
            type: "appointment.created",
            title: "New Appointment Booked",
            body: `Appointment booked via chat for ${formatHumanSlot(appointment.start_time, r.timezone || 'UTC')}`,
            receptionist_id: receptionistId,
            user_id: r.user_id,
            severity: "info",
            metadata: { appointment_id: appointment.id }
          });
          
          const elapsedMs = Date.now() - startTime;
          await logAnalytics(supabase, receptionistId, userId, userMessageRaw, confirmMsg, receptionistConfig, elapsedMs);
          
          return jsonResponse({ reply: confirmMsg, appointment });
        } catch (err: any) {
          console.error(`[${correlationId}] Alternative booking failed:`, err);
          const errMsg = "Sorry, I couldn't book that time. Please try again or choose a different option.";
          await logMessages(supabase, receptionistId, userId, userMessageRaw, errMsg);
          return jsonResponse({ reply: errMsg });
        }
      }

      // SLOT EXTRACTION
      const slotPrompt = `You are a slot extraction assistant. Extract booking information from user text and return ONLY valid JSON with these exact keys:
- intent: "book_appointment" or "none"
- service: string (service name) or null
- date: ISO date string (YYYY-MM-DD) or null
- time: time string (HH:MM in 24h format) or null
- customer_name: string or null
- contact: phone or email string or null
- clarity: "clear" or "uncertain"

Rules:
- If ANY required field (service, date, time) is missing or unclear, set clarity to "uncertain"
- Parse relative dates like "tomorrow", "next Monday" into ISO format
- Parse times like "3pm", "2:30" into 24h format (e.g., "15:00", "14:30")
- Extract contact from patterns like "+234...", "email@..." 
- If you cannot extract reliable information, set that key to null

Return ONLY valid JSON, no explanations or markdown.`;

      let slotOut: any;
      try {
        slotOut = await retryWithBackoff(async () => {
          const slotRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: slotPrompt },
                { role: "user", content: userMessageRaw }
              ],
              temperature: 0.0
            })
          });

          if (!slotRes.ok) {
            if (slotRes.status === 429) {
              throw new Error("Rate limit exceeded");
            }
            if (slotRes.status === 402) {
              throw new Error("Payment required - Lovable AI credits exhausted");
            }
            const errtxt = await slotRes.text();
            throw new Error(`Slot extraction failed: ${slotRes.status} ${errtxt}`);
          }

          return await slotRes.json();
        });
      } catch (err: any) {
        console.error(`[${correlationId}] Slot extraction error:`, err);
        let errMsg = "I'm having trouble processing your request. Could you rephrase that?";
        if (err.message.includes("Rate limit")) {
          errMsg = "System is busy. Please try again in a moment.";
        } else if (err.message.includes("Payment required")) {
          errMsg = "Service temporarily unavailable. Please contact support.";
        }
        await logMessages(supabase, receptionistId, userId, userMessageRaw, errMsg);
        return jsonResponse({ reply: errMsg });
      }

      const slotText = slotOut?.choices?.[0]?.message?.content || "{}";
      const slotJsonStr = extractJSON(slotText);

      let slots: any = {};
      try {
        slots = JSON.parse(slotJsonStr);
        console.log(`[${correlationId}] Extracted slots:`, slots);
      } catch (e) {
        console.warn(`[${correlationId}] Slot parse failed:`, e, slotJsonStr);
        const clarify = "I can help book that appointment. Could you tell me which service you need, your preferred date and time?";
        await logMessages(supabase, receptionistId, userId, userMessageRaw, clarify);
        return jsonResponse({ reply: clarify });
      }

      const { intent, service, date, time, customer_name, contact, clarity } = slots;

      if (intent !== "book_appointment") {
        console.log(`[${correlationId}] Intent not booking, falling through to normal chat`);
        // Fall through to normal chat flow below
      } else {
        // Check which critical slots are missing
        const missing = [];
        if (!service) missing.push("service");
        if (!date) missing.push("date");
        if (!time) missing.push("time");

        if (missing.length > 0 || clarity !== "clear") {
          const q = buildClarifyingQuestion(missing, { service, date, time, customer_name, contact });
          await logMessages(supabase, receptionistId, userId, userMessageRaw, q, null, {
            booking_flow: 'clarification_needed',
            missing_fields: missing,
            clarity
          });
          return jsonResponse({ reply: q });
        }

        // Parse datetime with timezone
        let requestedDateTime: string;
        try {
          requestedDateTime = parseISOLocal(date, time, r.timezone || 'UTC');
          console.log(`[${correlationId}] Requested datetime: ${requestedDateTime}`);
        } catch (err: any) {
          console.error(`[${correlationId}] Date parse error:`, err);
          const errMsg = "I couldn't understand that date/time. Could you provide it in format like 'December 1 at 2:30pm'?";
          await logMessages(supabase, receptionistId, userId, userMessageRaw, errMsg);
          return jsonResponse({ reply: errMsg });
        }

        // CHECK AVAILABILITY with retry
        console.log(`[${correlationId}] Checking availability for ${service} on ${date} at ${time}`);
        
        let checkRes: any;
        try {
          checkRes = await retryWithBackoff(() => 
            supabase.functions.invoke("check-availability", {
              body: {
                receptionist_id: receptionistId,
                service_id: null,
                startDate: date,
                endDate: date,
                desiredStart: requestedDateTime,
                maxSlots: 10
              }
            })
          );
          
          if (checkRes.error) throw new Error(checkRes.error.message);
        } catch (err: any) {
          console.error(`[${correlationId}] check-availability error:`, err);
          const errMsg = "I can't check availability right now. Please try again shortly.";
          await logMessages(supabase, receptionistId, userId, userMessageRaw, errMsg);
          return jsonResponse({ reply: errMsg });
        }

        const availableSlots = checkRes.data?.slots || [];
        const isAvailable = checkRes.data?.available === true;
        
        console.log(`[${correlationId}] Available: ${isAvailable}, Slots: ${availableSlots.length}`);

        if (!isAvailable && availableSlots.length === 0) {
          const altMsg = `Sorry, we don't have any available times on ${date}. Would you like to try a different date?`;
          await logMessages(supabase, receptionistId, userId, userMessageRaw, altMsg, null, {
            booking_flow: 'no_availability',
            requested_date: date
          });
          return jsonResponse({ reply: altMsg });
        }

        if (!isAvailable) {
          // Offer alternatives
          const topAlts = (checkRes.data?.alternatives || availableSlots).slice(0, 3);
          const alternatives = topAlts.map((slot: any, i: number) => {
            const slotTime = typeof slot === 'string' ? slot : slot.start;
            return formatHumanSlot(slotTime, r.timezone || 'UTC');
          });
          
          const altMsg = `That time isn't available. Here are some nearby options:\n${alternatives.map((a: string, i: number) => `${i + 1}. ${a}`).join('\n')}\n\nReply with "accept_alternative:1" (or 2, 3) to book one of these, or suggest a different time.`;
          
          await logMessages(supabase, receptionistId, userId, userMessageRaw, altMsg, null, {
            booking_flow: 'alternatives_offered',
            alternatives: topAlts,
            requested_time: requestedDateTime
          });
          
          return jsonResponse({ reply: altMsg, alternatives: topAlts });
        }

        // Need contact info before booking
        if (!contact) {
          const ask = "Great! I can book that time. Could you provide your phone number or email to confirm the appointment?";
          await logMessages(supabase, receptionistId, userId, userMessageRaw, ask, null, {
            booking_flow: 'contact_needed',
            requested_time: requestedDateTime,
            service
          });
          return jsonResponse({ reply: ask });
        }

        // BOOK APPOINTMENT with retry
        console.log(`[${correlationId}] Booking appointment`);
        
        let bookRes: any;
        try {
          bookRes = await retryWithBackoff(() => 
            supabase.functions.invoke("book-appointment", {
              body: {
                receptionistId,
                serviceId: null,
                startTime: requestedDateTime,
                customerName: sanitizeInput(customer_name || "Guest"),
                customerEmail: contact.includes("@") ? sanitizeInput(contact) : null,
                customerPhone: !contact.includes("@") ? sanitizeInput(contact) : null,
                source: "ai_receptionist",
                metadata: { 
                  booked_via_chat: true,
                  idempotency_key: idempotencyKey,
                  correlation_id: correlationId
                }
              }
            })
          );
          
          if (bookRes.error) throw new Error(bookRes.error.message);
        } catch (err: any) {
          console.error(`[${correlationId}] book-appointment error:`, err);
          const errMsg = "Sorry, I couldn't create that appointment right now. Please try again in a moment.";
          await logMessages(supabase, receptionistId, userId, userMessageRaw, errMsg);
          return jsonResponse({ reply: errMsg });
        }

        const appointment = bookRes.data?.appointment;
        const existed = bookRes.data?.existed === true;
        
        const confirmMsg = existed 
          ? `You already have an appointment for ${formatHumanSlot(appointment.start_time, r.timezone || 'UTC')}. Your confirmation ID is ${appointment.id}.`
          : `✅ Perfect! I've booked your ${service} appointment for ${formatHumanSlot(appointment.start_time, r.timezone || 'UTC')}. ${customer_name ? `See you soon, ${customer_name}!` : 'See you soon!'} Your confirmation ID is ${appointment.id}.`;
        
        await logMessages(supabase, receptionistId, userId, userMessageRaw, confirmMsg, null, {
          booking_flow: existed ? 'duplicate_prevented' : 'booked',
          appointment_id: appointment.id,
          idempotency_key: idempotencyKey,
          service,
          contact
        });

        // Create notification (only if new)
        if (!existed) {
          await supabase.from("notifications").insert({
            type: "appointment.created",
            title: `New Appointment: ${service}`,
            body: `${customer_name || 'Guest'} booked ${service} for ${formatHumanSlot(appointment.start_time, r.timezone || 'UTC')}`,
            receptionist_id: receptionistId,
            user_id: r.user_id,
            severity: "info",
            priority: "normal",
            metadata: { appointment_id: appointment.id, contact }
          });
        }

        const elapsedMs = Date.now() - startTime;
        await logAnalytics(supabase, receptionistId, userId, userMessageRaw, confirmMsg, receptionistConfig, elapsedMs, null, {
          booking_completed: true,
          appointment_id: appointment.id,
          was_duplicate: existed
        });

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

async function logMessages(
  supabase: any, 
  receptionistId: string, 
  userId: string | null, 
  userMessage: string, 
  reply: string, 
  faqMatch?: any,
  extraMetadata?: Record<string, any>
) {
  if (!userId) return;
  try {
    await supabase.from("chat_messages").insert([
      {
        receptionist_id: receptionistId,
        user_id: userId,
        sender: "user",
        message: sanitizeInput(userMessage),
        metadata: { 
          timestamp: new Date().toISOString(),
          ...(extraMetadata || {})
        },
      },
      {
        receptionist_id: receptionistId,
        user_id: userId,
        sender: "bot",
        message: sanitizeInput(reply),
        metadata: { 
          timestamp: new Date().toISOString(),
          faq_matched: !!faqMatch,
          ...(extraMetadata || {})
        },
      },
    ]);
    console.log(`[Chat] Messages logged`);
  } catch (e) {
    console.error(`[Chat] Failed to log messages:`, e);
  }
}

async function logAnalytics(
  supabase: any, 
  receptionistId: string, 
  userId: string | null, 
  request: string, 
  reply: string, 
  config: any, 
  latencyMs: number, 
  faqMatch?: any,
  extraTags?: Record<string, any>
) {
  try {
    const qualityScore = {
      overall: faqMatch ? 0.95 : 0.85,
      confidence: faqMatch ? 0.95 : 0.80,
      clarity: reply.length > 20 && reply.length < 500 ? 0.9 : 0.7,
      accuracy: faqMatch ? 1.0 : 0.85,
      ...(extraTags || {})
    };

    await supabase.from('ai_responses').insert({
      receptionist_id: receptionistId,
      user_id: userId || null,
      request_message: sanitizeInput(request),
      reply_text: sanitizeInput(reply),
      model: config.model || 'google/gemini-2.5-flash',
      latency_ms: latencyMs,
      temperature: config.temperature || 0.4,
      quality_score: qualityScore,
      confidence: qualityScore.confidence,
      channel: 'chat',
      tags: extraTags ? Object.keys(extraTags) : []
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
