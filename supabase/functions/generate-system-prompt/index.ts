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

    const systemPrompt = `You are a system that writes custom system prompts for AI receptionists.

Your job is to create a comprehensive, professional system prompt that will guide an AI receptionist's behavior based on the business data provided.

The system prompt you generate should:
- Define the AI's role as a receptionist for that specific business
- Incorporate the business's primary goal/objective into the AI's core mission and behavior
- Instruct the AI to speak in a warm, human-like, professional tone matching the business's specified tone preference
- Set clear boundaries on what it can and can't do
- Include detailed instructions for handling: greetings, short acknowledgments (ok, yep, kk), booking requests, FAQs, and frustrated customers
- Reference that the AI has access to a knowledge base (don't include the full KB content)
- Include all the advanced conversational guidelines: context awareness, emotional intelligence, personalization, natural language fluency
- Never allow the AI to refer to itself as "an AI" or "a bot"
- Include specific guidance based on the business type, services offered, and operational details
- Weave the business's goal naturally into the AI's purpose and conversation approach

Write the system prompt in a clear, directive style using bullet points and sections where appropriate.
Output ONLY the system prompt text, no additional commentary.`;

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
