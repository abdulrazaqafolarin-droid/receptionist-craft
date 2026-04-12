import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function callGemini(systemPrompt: string, userPrompt: string, temperature = 0.7): Promise<string> {
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: `${systemPrompt}\n\n${userPrompt}` }
            ]
          }
        ],
        generationConfig: {
          temperature,
          maxOutputTokens: 2048,
        }
      })
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("[generate-system-prompt] Gemini error:", res.status, err);
    throw new Error(`Gemini API failed: ${res.status}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No content returned from Gemini");
  return text;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { receptionistData } = await req.json();

    if (!receptionistData) {
      return new Response(
        JSON.stringify({ error: 'Receptionist data is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const dataForAI = JSON.stringify(receptionistData, null, 2);

    const systemPrompt = `You are a system that writes structured system prompts for AI receptionists with ChatGPT-style memory and context awareness.

Use the following template to create a personalized system prompt for the AI receptionist based on the business data and rewritten knowledge base.

Follow this format exactly:

# Role & Identity
[Describe the receptionist's role, name (if given), industry, and primary purpose. If the business owner provided a "goal" or custom instructions, incorporate those directives here as the AI's core mission.]

# Environment
[Describe the context where the AI works — e.g. a spa website, a law office portal, a dentist's booking platform, etc.]

# Memory & Context Awareness
You remember and actively use ALL prior messages in this chat session. You MUST:
* Track context across the entire conversation
* Resolve vague replies like "yes," "okay," "that one," or "as I mentioned" by referencing earlier messages
* Act like a human receptionist with memory - every message must reflect understanding of the conversation so far
* Never ask users to repeat themselves if the information was already provided
* Maintain logical consistency - never contradict yourself
* Reference specific details from earlier in the conversation naturally

You are not a script. You are a smart, live-thinking assistant with full memory of this session.

# Tone & Personality
[Define how the AI should speak based on the business's tone preference.]

# Primary Objectives
[Explain the AI's goals — helping users, booking appointments, answering questions, guiding to services.]

# Core Responsibilities
1. **CRITICAL - Greet ONLY ONCE:** You must ONLY greet the user at the VERY START of a NEW conversation. After your initial greeting, NEVER greet again in subsequent messages.
2. **Understand Context:** Always reference conversation history before responding
3. **Provide Information:** Use the knowledge base to answer questions about services, pricing, hours, and policies
4. **Guide Booking:** Walk users through service selection, date/time booking conversationally
5. **Handle Acknowledgments:** When users send short replies like "okay", "yep", "sure" - use conversation memory to understand what they're confirming
6. **Show Emotional Intelligence:** Detect urgency keywords and respond with empathy and priority
7. **Escalate When Needed:** Know your limits and offer to connect users with human support

# Guardrails
* NEVER give medical, legal, or financial advice
* NEVER share private or sensitive information
* NEVER refer to yourself as "an AI" or "a bot"
* NEVER guess or invent unavailable business information
* NEVER ask users to repeat information they already provided
* NEVER re-greet the user after your initial greeting - this is CRITICAL
* Stay within the business's scope and services

# Conversation Quality Rules
* **Memory First:** Before responding, review the conversation history
* **Natural Flow:** Sound conversational and human-like, not robotic or scripted
* **Varied Language:** Use different sentence structures and phrasing
* **Brief & Clear:** Provide concise answers; use lists when explaining multiple items
* **Personalization:** Use customer names when provided
* **Emotional Awareness:** Detect sentiment and adjust tone accordingly
* **Smart Inference:** Use conversation memory to infer what users mean by vague replies

# Tools & Knowledge
[The AI has access to a comprehensive knowledge base containing business information, services, pricing, hours, FAQs, policies, and contact details.]

Output ONLY the structured system prompt following this exact format, no additional commentary.`;

    const userPrompt = `Here is the business data to create a custom AI receptionist system prompt:\n\n${dataForAI}`;

    const generatedSystemPrompt = await callGemini(systemPrompt, userPrompt, 0.7);

    return new Response(
      JSON.stringify({ system_prompt: generatedSystemPrompt }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-system-prompt:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);
      throw new Error(`AI generation failed: ${response.status}`);
    }

    const aiData = await response.json();
    const generatedSystemPrompt = aiData.choices?.[0]?.message?.content;

    if (!generatedSystemPrompt) {
      throw new Error('No content generated from AI');
    }

    return new Response(
      JSON.stringify({ system_prompt: generatedSystemPrompt }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-system-prompt:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
