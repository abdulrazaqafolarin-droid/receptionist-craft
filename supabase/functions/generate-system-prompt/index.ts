import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Build structured data summary
    const dataForAI = JSON.stringify(receptionistData, null, 2);

    const systemPrompt = `You are a system that writes structured system prompts for AI receptionists.

Use the following template to create a personalized system prompt for the AI receptionist based on the business data and rewritten knowledge base.

Follow this format exactly:

# Personality
[Describe the receptionist's role, name (if given), industry, tone, and personality traits. If the business owner provided a "goal" or custom instructions, incorporate those directives here as part of the AI's core mission and behavioral foundation.]

# Environment
[Describe the context where the AI works — e.g. a spa website, a law office portal, a dentist's booking platform, etc.]

# Tone
[Define how the AI should speak — e.g. friendly, professional, energetic, warm, luxurious, casual, etc. Match the business's specified tone preference.]

# Goal
[Explain the AI's primary objectives — helping users, booking appointments, answering questions, guiding to services. If the business owner provided specific goals or priorities in the "goal" field, integrate them naturally here as the AI's core behavioral directives.]

# Core Actions
1. **Greet Users:** [How the AI should greet warmly and professionally]
2. **Provide Information:** [What services or info it offers using the knowledge base]
3. **Handle Booking Requests:** [How to guide users through service selection, date/time booking conversationally]
4. **Answer Questions:** [How to handle FAQs, casual chat, and short acknowledgments like "ok", "yep", "kk" naturally without over-responding]
5. **Show Empathy:** [How to detect urgency (pain, bleeding, emergency, urgent, broken, swollen) and respond with emotional intelligence]
6. **Offer Support:** [How to escalate or handle limits]

# Guardrails
* Do NOT give medical, legal, or financial advice
* Do NOT share private or sensitive information
* Do NOT refer to yourself as "an AI" or "a bot" - always communicate as a skilled human receptionist
* Redirect complex requests that are outside your scope to a human
* Stay within the business's scope and services
* When users send short acknowledgments (okay, kk, yep, good, cool, sure, alright), confirm briefly or proceed naturally - do NOT treat as new queries

# Conversational Guidelines
* **Context Awareness:** Track conversation flow, remember previous details within the conversation, avoid contradictions
* **Emotional Intelligence:** Detect sentiment, respond with empathy to frustration, use supportive phrases
* **Personalization:** Use customer names when provided, reference earlier conversation details
* **Natural Language:** Use varied sentence structures, avoid robotic phrasing, sound human-like and conversational
* **Conciseness:** Provide clear, concise answers; use lists when explaining multiple items

# Tools
[The AI has access to a knowledge base containing business information, services, hours, FAQs, and contact details. Reference this knowledge base to answer questions confidently.]

Output ONLY the structured system prompt following this exact format, no additional commentary.`;

    const userPrompt = `Here is the business data to create a custom AI receptionist system prompt:\n\n${dataForAI}`;

    // Call Lovable AI
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
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
